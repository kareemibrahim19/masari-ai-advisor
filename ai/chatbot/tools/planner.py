"""Graduation planner: a term-by-term plan from where the student is now to graduation.

The student picks a target (4, 4.5 or 5 years from enrollment) and, for the what-if, the courses of the
current term they might fail and the term GPA they expect. The plan is solved as a small integer program
(scipy's MILP / HiGHS): every remaining course gets exactly one term, subject to the regulations.

Offering rules (confirmed by the team):
- A course runs only in the term of its plan semester (odd = fall, even = spring); electives run in both.
- Summer can open any course if enough students ask, so a summer course is marked "if the college opens it".
- Training is a summer activity; the college can also let a student register it in fall / spring.
- Projects never run in summer.
- The graduation term has no extra hours, but the college can open one course outside its term for a
  student who needs it to graduate (a request to the college).

The solver keeps the plan as close to the regulation plan as it can and uses summers, out-of-term
training and graduation requests only when the target needs them.
"""

import threading
from functools import lru_cache

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import coo_matrix

from . import _data as d
from .rules import ARTICLES, _on_warning

# Target years -> the last main semester (counted from enrollment) the student may graduate in.
TARGETS = {4: 8, 4.5: 9, 5: 10}
TERM_AR = {"fall": "الخريف", "spring": "الربيع", "summer": "الصيفي"}
TERM_EN = {"fall": "Fall", "spring": "Spring", "summer": "Summer"}
_NEXT = {"fall": "spring", "spring": "summer", "summer": "fall"}

# Objective weights. Summers and special requests depend on the college, so they cost much more than
# moving a course a term away from its plan semester (1 per term).
COST_SUMMER_TERM = 40
COST_SUMMER_COURSE = 20
COST_TRAINING_IN_MAIN = 25
COST_GRADUATION_REQUEST = 60
COST_UNDER_MIN_HOUR = 2  # per hour a main term with courses falls below the 12-hour minimum
MAX_GRADUATION_REQUESTS = 1

# HiGHS can deadlock when several web requests solve at the same time, so solves run one at a time.
_SOLVE_LOCK = threading.Lock()

FLAG_AR = {
    "regular": "في ميعادها حسب اللائحة",
    "summer_on_demand": "صيفي: لو الكلية فتحتها (حسب طلب الطلاب)",
    "training_summer": "التدريب في الإجازة الصيفية",
    "college_request": "التدريب في ترم أساسي: بموافقة الكلية",
    "graduation_request": "مادة في غير ترمها عشان التخرج: بطلب للكلية",
}


# ---------------------------------------------------------------- the student after the current term

def _grade_points() -> dict:
    return d.rules()["grade_points"]


def _projection(s: dict, failed: list[str], term_gpa: float | None) -> dict:
    """Passed courses, earned hours and the cumulative GPA once the current term is graded.

    Every current course passes except the ones in `failed`. With `term_gpa`, the passed graded courses
    share the points that give that term GPA (the failed ones count 0); without it they keep the
    student's current GPA, so the cumulative GPA only moves because of the failures.
    """
    gp, allc = _grade_points(), d.courses()
    best = d.best_attempts(s)
    cur = d.current_courses(s)
    cur_codes = [c["code"] for c in cur]
    cgpa = s["academic_status"]["cumulative_gpa"]

    passed = {code for code, a in best.items() if d.passed(a)} | (set(cur_codes) - set(failed))
    passed -= set(failed)

    # Points of the graded courses from earlier terms, minus the ones being retaken now.
    old = [a for code, a in best.items() if a["grade"] in gp and code not in cur_codes]
    hours = sum(a["credits"] for a in old)
    points = sum(gp[a["grade"]] * a["credits"] for a in old)

    graded_now = [c for c in cur if allc.get(c["code"], {}).get("graded", True) and c["credits"] > 0]
    now_hours = sum(c["credits"] for c in graded_now)
    pass_hours = sum(c["credits"] for c in graded_now if c["code"] not in failed)

    assumed = None
    if term_gpa is not None:
        if now_hours and pass_hours == 0 and term_gpa > 0:
            return {"error": "لو سقطت في كل مواد الترم يبقى معدل الترم 0."}
        per_pass = term_gpa * now_hours / pass_hours if pass_hours else 0.0
        if per_pass > 4.0 + 1e-9:
            best_possible = round(4.0 * pass_hours / now_hours, 2) if now_hours else 0
            return {"error": f"مع المواد اللي اخترت إنك تسقط فيها، أعلى معدل ترم ممكن {best_possible}.",
                    "max_term_gpa": best_possible}
        term_out = term_gpa
    else:
        if cgpa is None:
            # First term with no GPA yet: assume the middle band until the student enters a term GPA.
            per_pass, assumed = 2.5, "مفيش معدل لسه، فافترضنا معدل ترم 2.5 لحد ما تختار معدلك المتوقع."
        else:
            per_pass = cgpa
        term_out = round(per_pass * pass_hours / now_hours, 2) if now_hours else None

    new_hours = hours + now_hours
    new_points = points + per_pass * pass_hours
    new_cgpa = round(new_points / new_hours, 2) if new_hours else cgpa
    earned = sum(allc[c]["credits"] for c in passed if c in allc)
    return {"passed": passed, "earned": earned, "cgpa": new_cgpa, "term_gpa": term_out, "assumption": assumed}


def _load_cap(cgpa: float | None, main_done: int) -> tuple[int, str]:
    """Max hours per main term for a GPA (article 13), assumed to hold for the rest of the plan."""
    r = d.rules()
    if cgpa is None:
        return 21, "مفيش معدل تراكمي، فالحد 21 ساعة."
    if _on_warning(cgpa, main_done):
        return r["probation_max_credits"], f"معدلك هيبقى {cgpa} (أقل من 2.00) فهتبقى تحت الإنذار: الحد {r['probation_max_credits']} ساعة."
    band = next(b for b in r["max_credits_by_gpa"] if b["gpa_min"] <= cgpa < b["gpa_max"])
    return band["max_credits"], f"معدلك هيبقى {cgpa} فالحد {band['max_credits']} ساعة في الترم."


# ---------------------------------------------------------------- terms and courses to place

def _terms_after(current: dict, first_main: int, last_main: int) -> list[dict]:
    """Terms after the current one up to (and including) main semester `last_main`."""
    out, kind, year = [], current["term"], current["academic_year"]
    main = first_main - 1
    while True:
        kind = _NEXT[kind]
        if kind == "fall":
            y = int(year.split("-")[0]) + 1
            year = f"{y}-{y + 1}"
        if kind != "summer":
            main += 1
            if main > last_main:
                return out
        # A summer sits between main semester `main` and `main + 1`.
        out.append({"term": kind, "academic_year": year, "main": main if kind != "summer" else None,
                    "pos": main if kind != "summer" else main + 0.5})
        if kind != "summer" and main == last_main:
            return out


def _to_place(passed: set[str]) -> tuple[list[dict], list[dict]]:
    """(required courses still to pass, elective pools with how many each still needs)."""
    allc = d.courses()
    required = [c for c in allc.values() if c["type"] != "elective" and c["code"] not in passed]
    slot_sem = {sl["slot"]: sl["semester"] for sl in d.program()["elective_slots"]}
    pools = []
    for p in d.program()["elective_pools"]:
        done = sum(1 for code in p["courses"] if code in passed)
        need = max(0, p["choose"] - done)
        if need:
            sems = sorted(slot_sem[s] for s in p["slots"])
            pools.append({"level": p["level"], "need": need, "planned": sems[0],
                          "candidates": [allc[c] for c in p["courses"] if c not in passed]})
    return required, pools


def _options(course: dict, term: dict, planned: int, last_main: int, allow_summer: bool) -> str | None:
    """How the course can be taken in this term (a flag), or None if it cannot."""
    kind = course["type"]
    if term["term"] == "summer":
        if kind == "training":
            return "training_summer"
        if kind == "project" or not allow_summer:
            return None
        return "summer_on_demand"
    if kind == "training":
        return "college_request"
    if kind == "elective":
        return "regular"
    in_term = (planned % 2 == 1) == (term["term"] == "fall")
    if in_term:
        return "regular"
    if kind == "project":
        return None
    return "graduation_request" if term["main"] == last_main else None


# ---------------------------------------------------------------- the integer program

def _solve(passed: set[str], earned: int, cap: int, terms: list[dict], last_main: int, allow_summer: bool):
    """Place every remaining course in a term. Returns {code: (term index, flag)} or None if infeasible."""
    allc = d.courses()
    required, pools = _to_place(passed)
    items = [(c, c["planned_semester"], None) for c in required]
    for i, p in enumerate(pools):
        items += [(c, p["planned"], i) for c in p["candidates"]]

    var = []  # (item index, term index, flag)
    cost = []
    for ii, (c, planned, _) in enumerate(items):
        for ti, t in enumerate(terms):
            flag = _options(c, t, planned, last_main, allow_summer)
            if not flag:
                continue
            var.append((ii, ti, flag))
            cost.append(abs(t["pos"] - planned) + {"summer_on_demand": COST_SUMMER_COURSE,
                                                   "college_request": COST_TRAINING_IN_MAIN,
                                                   "graduation_request": COST_GRADUATION_REQUEST}.get(flag, 0))
    summers = [ti for ti, t in enumerate(terms) if t["term"] == "summer"]
    mains = [ti for ti, t in enumerate(terms) if t["term"] != "summer"]
    n_x = len(var)
    # Extra variables: "summer used" per summer, then per main term "has courses" and "hours under 12".
    n_s = n_x + len(summers)
    n = n_s + 2 * len(mains)
    cost += [COST_SUMMER_TERM] * len(summers) + [0, COST_UNDER_MIN_HOUR] * len(mains)

    rows, cols, vals, lo, hi = [], [], [], [], []

    def add(coefs: dict, lower: float, upper: float):
        r = len(lo)
        for col, v in coefs.items():
            rows.append(r), cols.append(col), vals.append(v)
        lo.append(lower), hi.append(upper)

    by_item: dict[int, list[int]] = {}
    for k, (ii, _, _) in enumerate(var):
        by_item.setdefault(ii, []).append(k)
    code_of = {ii: c["code"] for ii, (c, _, _) in enumerate(items)}
    item_of = {c["code"]: ii for ii, (c, _, _) in enumerate(items)}

    # Each required course exactly once; each elective at most once and each pool its count.
    for ii, (c, _, pool) in enumerate(items):
        ks = by_item.get(ii, [])
        if pool is None:
            if not ks:
                return None
            add({k: 1 for k in ks}, 1, 1)
        elif ks:
            add({k: 1 for k in ks}, 0, 1)
    for i, p in enumerate(pools):
        ks = [k for ii, (_, _, pool) in enumerate(items) if pool == i for k in by_item.get(ii, [])]
        add({k: 1 for k in ks}, p["need"], p["need"])

    # Prerequisites: a course only after each unpassed prerequisite, in an earlier term.
    for k, (ii, ti, _) in enumerate(var):
        for pre in allc[code_of[ii]]["prerequisites"]:
            if pre in passed:
                continue
            if pre not in item_of:
                return None
            before = [k2 for k2 in by_item.get(item_of[pre], []) if var[k2][1] < ti]
            add({k: 1, **{k2: -1 for k2 in before}}, -np.inf, 0)

    # Credit-hour thresholds (trainings and projects): enough hours earned before that term.
    credits = [allc[code_of[ii]]["credits"] for ii, _, _ in var]
    for k, (ii, ti, _) in enumerate(var):
        need = allc[code_of[ii]].get("min_credits_required") or 0
        if need <= earned:
            continue
        coefs = {k2: -credits[k2] for k2 in range(n_x) if var[k2][1] < ti and credits[k2]}
        coefs[k] = need
        add(coefs, -np.inf, earned)

    # Load: main terms up to the GPA cap; summers at most 3 courses (training not counted).
    max_summer = d.rules()["summer"]["max_courses"]
    min_load = d.rules()["min_credits_main_semester"]
    for ti, t in enumerate(terms):
        ks = [k for k in range(n_x) if var[k][1] == ti]
        if t["term"] == "summer":
            courses_k = [k for k in ks if var[k][2] == "summer_on_demand"]
            if courses_k:
                si = n_x + summers.index(ti)
                add({**{k: 1 for k in courses_k}, si: -max_summer}, -np.inf, 0)
        elif ks:
            active = n_s + 2 * mains.index(ti)
            add({k: credits[k] for k in ks}, -np.inf, cap)
            add({**{k: 1 for k in ks}, active: -len(ks)}, -np.inf, 0)  # any course -> active
            # Minimum load (soft): hours + shortfall >= 12 when the term has courses.
            add({**{k: credits[k] for k in ks}, active: -min_load, active + 1: 1}, 0, np.inf)

    reqs = [k for k in range(n_x) if var[k][2] == "graduation_request"]
    if reqs:
        add({k: 1 for k in reqs}, 0, MAX_GRADUATION_REQUESTS)

    if not lo:
        return {}
    A = coo_matrix((vals, (rows, cols)), shape=(len(lo), n)).tocsr()
    upper = np.ones(n)
    upper[n_s + 1::2] = min_load  # the shortfall variables count hours
    with _SOLVE_LOCK:
        res = milp(np.array(cost, dtype=float), integrality=np.ones(n), bounds=Bounds(0, upper),
                   constraints=LinearConstraint(A, lo, hi), options={"time_limit": 10})
    if res.x is None or res.status not in (0, 1):
        return None
    return {code_of[ii]: (ti, flag) for k, (ii, ti, flag) in enumerate(var) if res.x[k] > 0.5}


# ---------------------------------------------------------------- the tool

# ---------------------------------------------------------------- why a target is not possible

SUMMER_HOURS = 9  # 3 summer courses of 3 credit hours: the most a summer can add
_TERM_WORD = {"fall": ("خريف", "Fall"), "spring": ("ربيع", "Spring"), "summer": ("صيفي", "Summer")}


def _short(t: dict) -> dict:
    """'خريف 2027' / 'Fall 2027': the calendar year the semester falls in."""
    start = int(t["academic_year"].split("-")[0])
    year = start if t["term"] == "fall" else start + 1
    ar, en = _TERM_WORD[t["term"]]
    return {"ar": f"{ar} {year}", "en": f"{en} {year}"}


def _name(code: str) -> dict:
    c = d.courses()[code]
    return {"ar": f"{c['name_ar']} ({code})", "en": f"{c.get('name_en') or code} ({code})"}


def _why_not(proj: dict, cap: int, current: dict, main_now: int, last_main: int, allow_summer: bool,
             failed_codes: set[str], target_years, retaking: set[str] = frozenset()) -> dict:
    """A short, plain reason the target is not reachable, in Arabic and English.

    It finds the earliest term every remaining course could possibly be taken in (prerequisites, each
    course's term, summer, and the most hours the student could have earned by then), ignoring how full
    each term is. A course whose earliest term is after the target is the reason, traced back to what
    holds it (a failed course, a long chain, an hour threshold). If every course fits on its own, the
    reason is the number of hours left against the hour cap.
    """
    target = {"ar": {4: "4 سنين", 4.5: "4 سنين ونص", 5: "5 سنين"}[target_years],
              "en": {4: "4-year", 4.5: "4.5-year", 5: "5-year"}[target_years]}
    allc = d.courses()
    passed = proj["passed"]
    terms = _terms_after(current, main_now + 1, 2 * d.rules()["max_study_years"])
    deadline = max(i for i, t in enumerate(terms) if t["main"] is not None and t["main"] <= last_main)

    # The most hours the student can have earned before term i.
    before, total = [], proj["earned"]
    for t in terms:
        before.append(total)
        total += (SUMMER_HOURS if allow_summer else 0) if t["term"] == "summer" else cap

    required, pools = _to_place(passed)
    memo: dict[str, tuple] = {}

    def earliest(code: str):
        """(term index or None, cause) where cause explains what decided it."""
        if code in memo:
            return memo[code]
        memo[code] = (None, ("cycle",))
        c = allc[code]
        lower, held_by = 0, None
        for p in c["prerequisites"]:
            if p in passed:
                continue
            pi, _ = earliest(p)
            if pi is None:
                memo[code] = (None, ("prereq", p))
                return memo[code]
            if pi + 1 > lower:
                lower, held_by = pi + 1, p
        need = c.get("min_credits_required") or 0
        planned = c["planned_semester"] or 7
        short_of = None  # (term index, hours) of the last term it ran in but the hours were not enough
        for i in range(lower, len(terms)):
            if not _options(c, terms[i], planned, last_main, allow_summer):
                continue
            if before[i] < need:
                short_of = (i, before[i])
                continue
            cause = ("credits", need, *short_of) if short_of else ("prereq", held_by) if held_by else ("term",)
            memo[code] = (i, cause)
            return memo[code]
        memo[code] = (None, ("credits", need, *short_of) if short_of else ("term",))
        return memo[code]

    late = [(earliest(c["code"])[0], c["code"]) for c in required]
    for p in pools:  # electives: the pool is late if its need-th earliest course is late
        ranked = sorted(((earliest(c["code"])[0], c["code"]) for c in p["candidates"]), key=lambda x: (x[0] is None, x[0] or 0))
        late.append(ranked[p["need"] - 1])
    late = [(i, code) for i, code in late if i is None or i > deadline]

    if late:
        # The latest course explains the most; trace what holds it back to the root.
        i, code = max(late, key=lambda x: (x[0] is None, x[0] or 0))
        chain = [code]
        while True:
            cause = earliest(chain[-1])[1]
            if cause[0] == "prereq" and cause[1] and cause[1] not in chain:
                chain.append(cause[1])
            else:
                break
        root = chain[-1]
        ri, rcause = earliest(root)
        when = lambda k: _short(terms[k]) if k is not None else {"ar": "بعد الحد الأقصى للدراسة", "en": "after the study limit"}
        ar, en = [], []
        for p in allc[root]["prerequisites"]:
            if p in retaking:
                ar.append(f"إنت سقطت في {_name(p)['ar']} قبل كده وبتعيدها الترم ده، فاللي بعدها اتأخر.")
                en.append(f"You failed {_name(p)['en']} before and are retaking it this semester, so what follows it is delayed.")
        if root in failed_codes:
            ar.append(f"إنت سقطت في {_name(root)['ar']} ولازم تعيدها.")
            en.append(f"You failed {_name(root)['en']} and must retake it.")
        if rcause[0] == "credits":
            _, need, k, have = rcause
            ar.append(f"{_name(root)['ar']} محتاج {need} ساعة ناجحة قبل ما تسجله، وأقصى اللي هتوصله قبل "
                      f"{_short(terms[k])['ar']} هو {have} ساعة، فأول فرصة ليه {when(ri)['ar']}.")
            en.append(f"{_name(root)['en']} needs {need} passed credit hours, and the most you can have before "
                      f"{_short(terms[k])['en']} is {have}, so the earliest you can take it is {when(ri)['en']}.")
        else:
            only = "الخريف" if (allc[root]["planned_semester"] or 1) % 2 == 1 else "الربيع"
            only_en = "Fall" if only == "الخريف" else "Spring"
            if allow_summer and allc[root]["type"] != "project":
                ar.append(f"{_name(root)['ar']} بيتدرّس في {only} (أو الصيفي لو اتفتح)، فأول فرصة ليه {when(ri)['ar']}.")
                en.append(f"{_name(root)['en']} runs in {only_en} (or summer, if opened), so the earliest you can take it is {when(ri)['en']}.")
            else:
                ar.append(f"{_name(root)['ar']} بيتدرّس في {only} بس، فأول فرصة ليه {when(ri)['ar']}.")
                en.append(f"{_name(root)['en']} runs in {only_en} only, so the earliest you can take it is {when(ri)['en']}.")
        if len(chain) > 1:
            links_ar = " ← ".join(reversed(chain))
            ar.append(f"وكل مادة في السلسلة دي لازم تيجي بعد اللي قبلها: {links_ar}، فـ {_name(code)['ar']} مش هتلحق قبل {when(i)['ar']}.")
            en.append(f"Each course in this chain must follow the one before it ({' → '.join(reversed(chain))}), "
                      f"so {_name(code)['en']} cannot come before {when(i)['en']}.")
        ar.append(f"وده بعد آخر ترم في هدف {target['ar']} ({_short(terms[deadline])['ar']}).")
        en.append(f"That is after the last semester of the {target['en']} target ({_short(terms[deadline])['en']}).")
        return {"code": "course", "course": code, "root": root, "chain": list(reversed(chain)),
                "ar": " ".join(ar), "en": " ".join(en)}

    # Every course fits on its own, so it is the hours: what is left against what can be registered.
    left = sum(c["credits"] for c in required) + sum(3 * p["need"] for p in pools)
    room = before[deadline + 1] - proj["earned"] if deadline + 1 < len(before) else total - proj["earned"]
    summer_ar = " مع الصيفي" if allow_summer else " من غير صيفي"
    summer_en = " with summers" if allow_summer else " without summers"
    if left > room:
        return {"code": "hours", "left": left, "room": room,
                "ar": f"فاضلك {left} ساعة، وأقصى اللي تقدر تسجله لحد {_short(terms[deadline])['ar']} هو {room} ساعة "
                      f"(حد {cap} ساعة في الترم{summer_ar}).",
                "en": f"You have {left} credit hours left, and the most you can register by {_short(terms[deadline])['en']} "
                      f"is {room} ({cap} per semester{summer_en})."}
    return {"code": "fit",
            "ar": f"المواد الفاضلة مش هتتوزع على الترمات لحد {_short(terms[deadline])['ar']}: كل مادة ليها ترمها "
                  f"ومتطلباتها، وحد الساعات {cap} ساعة في الترم{summer_ar}.",
            "en": f"The remaining courses do not fit into the semesters up to {_short(terms[deadline])['en']}: each course has "
                  f"its own semester and prerequisites, and the limit is {cap} hours per semester{summer_en}."}


def _count(n: int, one: str, two: str, few: str, many: str) -> str:
    return one if n == 1 else two if n == 2 else f"{n} {few}" if n <= 10 else f"{n} {many}"


def _term_label(t: dict) -> dict:
    return {"ar": f"{TERM_AR[t['term']]} {t['academic_year']}", "en": f"{TERM_EN[t['term']]} {t['academic_year']}"}


def _plan_for(proj: dict, cap: int, current: dict, main_now: int, last_main: int, allow_summer: bool):
    return _plan_cached(frozenset(proj["passed"]), proj["earned"], cap, current["term"], current["academic_year"],
                        main_now, last_main, allow_summer)


@lru_cache(maxsize=512)
def _plan_cached(passed: frozenset, earned: int, cap: int, term: str, year: str, main_now: int, last_main: int,
                 allow_summer: bool):
    """Same inputs, same plan: switching targets back and forth on the page reuses earlier solves."""
    terms = _terms_after({"term": term, "academic_year": year}, main_now + 1, last_main)
    placed = _solve(set(passed), earned, cap, terms, last_main, allow_summer)
    return terms, placed


def _earliest(proj, cap, current, main_now, allow_summer, start: int):
    """The earliest main semester the student can graduate in with this cap (None within the 10-year limit)."""
    limit = 2 * d.rules()["max_study_years"]
    for last in range(max(start, main_now + 1), limit + 1):
        terms, placed = _plan_for(proj, cap, current, main_now, last, allow_summer)
        if placed is not None:
            return last, terms, placed
    return None, None, None


def build_graduation_plan(student_id: str, target_years: float = 5, allow_summer: bool = True,
                          failed_courses: list[str] | None = None, expected_term_gpa: float | None = None) -> dict:
    """A term-by-term plan to graduate within `target_years` (4, 4.5 or 5) of enrollment.

    What-if inputs: `failed_courses` (current-term courses the student fails) and `expected_term_gpa`.
    """
    s = d.get_student(student_id)
    if not s:
        return d.not_found("الطالب", student_id)
    if target_years not in TARGETS:
        return {"found": False, "error": "الهدف لازم يكون 4 أو 4.5 أو 5 سنين."}
    target_years = int(target_years) if float(target_years).is_integer() else target_years  # 5.0 -> 5
    current = next((t for t in s["terms"] if t["status"] == "in_progress"), None)
    if not current:
        return {"found": False, "error": "مفيش ترم حالي مسجل للطالب."}
    if expected_term_gpa is not None and not 0 <= expected_term_gpa <= 4:
        return {"found": False, "error": "معدل الترم لازم يكون بين 0 و 4."}

    cur_codes = [c["code"] for c in current["courses"]]
    failed = []
    for f in failed_courses or []:
        code = d.normalize_code(f) or f
        if code not in cur_codes:
            return {"found": False, "error": f"{code} مش من مواد الترم الحالي."}
        failed.append(code)

    proj = _projection(s, failed, expected_term_gpa)
    if "error" in proj:
        return {"found": False, **proj}
    main_now = s["academic_status"]["main_semesters_completed"] + 1  # the current term's main semester
    cap, cap_why = _load_cap(proj["cgpa"], main_now)
    last_main = TARGETS[target_years]

    out = {
        "found": True, "student_id": s["student_id"], "target_years": target_years, "allow_summer": allow_summer,
        "current_term": _term_label(current), "current_main_semester": main_now,
        "what_if": {"failed_courses": [d.course_label(c) for c in failed], "expected_term_gpa": expected_term_gpa},
        "after_this_term": {"cumulative_gpa": proj["cgpa"], "term_gpa": proj["term_gpa"],
                            "earned_hours": proj["earned"], "max_credits": cap, "why": cap_why},
        "assumptions": [a for a in (
            proj["assumption"],
            "حد الساعات محسوب من معدلك بعد الترم ده، ومفترض إنه هيفضل كده لحد التخرج.",
            "كل مادة بتتدرّس في ترمها حسب الخطة، والاختياري في الترمين.",
            "الصيفي: أي مادة غير المشاريع ممكن تتفتح لو الطلاب طلبوها، بحد أقصى 3 مواد." if allow_summer else
            "من غير صيفي (غير التدريب).",
        ) if a],
        "articles": [ARTICLES["load"], ARTICLES["training"], ARTICLES["project"]],
    }

    remaining_required, pools = _to_place(proj["passed"])
    if not remaining_required and not pools:
        return {**out, "feasible": True, "graduation_term": _term_label(current), "terms": [],
                "explanation": "لو نجحت في مواد الترم ده هتتخرج في آخره."}

    if last_main <= main_now:  # courses are left after this semester, so a target ending by now is out of reach
        feasible, terms, placed, reason_code = False, None, None, "past"
        why = {"code": "past",
               "ar": f"إنت دلوقتي في الترم رقم {main_now}، وهدف {target_years} سنين آخره الترم رقم {last_main}"
                     + ("، ولسه فاضلك مواد بعد الترم ده." if last_main == main_now else "."),
               "en": f"You are in semester {main_now} now, and the {target_years}-year target ends with semester {last_main}"
                     + (", but you still have courses left after this semester." if last_main == main_now else ".")}
    else:
        terms, placed = _plan_for(proj, cap, current, main_now, last_main, allow_summer)
        feasible = placed is not None
        reason_code = None if feasible else "constraints"
        why = None
        if not feasible:
            best = d.best_attempts(s)
            failed_codes = {c for c, a in best.items() if a["grade"] in ("F", "FP")} | set(failed)
            retaking = {c for c in cur_codes if c not in failed and best.get(c, {}).get("grade") in ("F", "FP")}
            why = _why_not(proj, cap, current, main_now, last_main, allow_summer, failed_codes, target_years, retaking)
    reason = why["ar"] if why else None

    if not feasible:
        last, terms, placed = _earliest(proj, cap, current, main_now, allow_summer, last_main + 1)
        out["feasible"] = False
        out["reason"], out["reason_code"], out["why"] = reason, reason_code, why
        if last is None:
            return {**out, "terms": [], "graduation_term": None,
                    "explanation": f"{reason} ومفيش خطة تخرج خلال الحد الأقصى للدراسة."}
        out["earliest_main_semester"] = last
    else:
        out["feasible"] = True

    rows = []
    for ti, t in enumerate(terms):
        cs = [code for code, (k, _) in placed.items() if k == ti]
        allc = d.courses()
        courses = sorted(({"code": code, "name_ar": allc[code]["name_ar"], "name_en": allc[code].get("name_en"),
                           "credits": allc[code]["credits"], "type": allc[code]["type"],
                           "planned_semester": allc[code]["planned_semester"],
                           "flag": placed[code][1], "flag_ar": FLAG_AR[placed[code][1]]} for code in cs),
                         key=lambda c: (c["type"] == "training", c["code"]))
        rows.append({**_term_label(t), "term": t["term"], "academic_year": t["academic_year"],
                     "main_semester": t["main"], "credits": sum(c["credits"] for c in courses),
                     "max_credits": cap if t["term"] != "summer" else None, "courses": courses})
    last_i = max((i for i, r in enumerate(rows) if r["courses"]), default=-1)
    rows = rows[:last_i + 1]
    grad = rows[-1] if rows else None
    min_load = d.rules()["min_credits_main_semester"]
    for r in rows[:-1]:
        if r["term"] != "summer" and r["credits"] < min_load:
            r["warning"] = f"أقل من الحد الأدنى ({min_load} ساعة) لأن مفيش مواد متاحة كفاية في الترم ده."

    summer_courses = [c["code"] for r in rows if r["term"] == "summer" for c in r["courses"]
                      if c["flag"] == "summer_on_demand"]
    requests = [c["code"] for r in rows for c in r["courses"] if c["flag"] in ("college_request", "graduation_request")]
    out.update({"graduation_term": {"ar": grad["ar"], "en": grad["en"]} if grad else None, "terms": rows,
                "summer_courses": summer_courses, "college_requests": requests})

    grad_txt = grad["ar"] if grad else ""
    extra = []
    if summer_courses:
        extra.append(f"{_count(len(summer_courses), 'مادة واحدة', 'مادتين', 'مواد', 'مادة')} في الصيفي (لو الكلية فتحتها)")
    if requests:
        extra.append(_count(len(requests), "طلب واحد للكلية", "طلبين للكلية", "طلبات للكلية", "طلب للكلية"))
    extra_txt = ("، ومحتاج " + " و".join(extra)) if extra else ""
    if out["feasible"]:
        out["explanation"] = f"تقدر تتخرج في {grad_txt} ({target_years} سنين){extra_txt}. {cap_why}"
    else:
        out["explanation"] = f"هدف {target_years} سنين مش ممكن: {reason} أقرب تخرج: {grad_txt}{extra_txt}. {cap_why}"
    return out


def plan_options(student_id: str, failed_courses: list[str] | None = None,
                 expected_term_gpa: float | None = None) -> dict:
    """Which targets are reachable, with and without summer: a 3 x 2 table for the plan page."""
    rows = []
    for years in TARGETS:
        cells = {}
        for summer in (False, True):
            p = build_graduation_plan(student_id, years, summer, failed_courses, expected_term_gpa)
            if not p.get("found"):
                return p
            cells["with_summer" if summer else "without_summer"] = {
                "feasible": p["feasible"], "graduation_term": p["graduation_term"], "why": p.get("why"),
                "summer_courses": len(p.get("summer_courses", [])), "college_requests": len(p.get("college_requests", []))}
        rows.append({"target_years": years, **cells})
    return {"found": True, "student_id": student_id, "options": rows}


def graduation_plan(student_id: str, target_years: float | None = None, allow_summer: bool | None = None) -> dict:
    """The chat's view of the graduation plan: the same planner and the same result as the plan page, kept short.

    Without `target_years` it answers for the target the student picked on the plan page (passed in by the
    website), else 5 years. It always includes the table of all three targets, so "can I graduate in 4 years?"
    and "when will I graduate?" get the page's answer.
    """
    years = target_years if target_years in TARGETS else 5
    summer = True if allow_summer is None else bool(allow_summer)
    p = build_graduation_plan(student_id, years, summer)
    if not p.get("found"):
        return p
    opts = plan_options(student_id)["options"]

    def cell(c):
        return {"possible": c["feasible"], "graduation": (c["graduation_term"] or {}).get("ar"),
                "why_not": (c.get("why") or {}).get("ar")}

    out = {
        "found": True, "target_years": years, "allow_summer": summer, "possible": p["feasible"],
        "graduation": (p["graduation_term"] or {}).get("ar"),
        "summer_courses": p.get("summer_courses", []), "college_requests": p.get("college_requests", []),
        "credit_cap_per_semester": p["after_this_term"]["max_credits"],
        "all_targets": [{"target_years": o["target_years"], "with_summer": cell(o["with_summer"]),
                         "without_summer": cell(o["without_summer"])} for o in opts],
        "source": "نفس حسبة صفحة خطة التخرج في الموقع",
    }
    if not p["feasible"]:
        out["why_not"] = (p.get("why") or {}).get("ar")
        out["earliest_graduation"] = out["graduation"]
    out["explanation"] = p["explanation"]
    return out
