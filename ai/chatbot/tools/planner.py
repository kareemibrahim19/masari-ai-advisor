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
- No main semester is left empty before graduation: when a student has nothing that runs in a semester, the
  college opens a course for them (one, by request). Confirmed by the team 2026-10-17.
- A target ends with the summer after its last semester: graduating in the summer of year 4 is "4 years"
  (confirmed 2026-10-17).

The solver keeps the plan as close to the regulation plan as it can and uses summers, out-of-term
training and graduation requests only when the target needs them.
"""

import math
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import coo_matrix

from . import _data as d
from .rules import ARTICLES, PAPER_COURSE_CREDITS, PAPER_MAX_LOW_GPA, _on_warning

# Target years -> the last main semester (counted from enrollment) of the target; the summer right after it counts
# too (graduating in the summer of year 4 is within 4 years).
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
# A course in the summer right after the target's last semester is the last resort (decided 2026-10-20): the target
# should end in its last main semester, with an earlier summer and requests to the college if needed. It costs more
# than those together (a summer 60 + two requests 120), so it is used only when nothing else works.
COST_SUMMER_AFTER_LAST = 300
COST_PAPER_REGISTRATION = 15  # a project registered within its hours tolerance (paper registration)
COST_PAPER_LOAD = 15  # 15 hours on paper with a GPA under 2.00 (five 3-credit courses)
COST_UNDER_MIN_HOUR = 30  # per hour a semester before graduation falls below 12 (council approval, avoided)
COST_GRAD_UNDER_MIN_HOUR = 5  # per hour the graduation semester falls below 12 (paper registration)
MAX_GRADUATION_REQUESTS = 1

# HiGHS can deadlock when it is called from more than one thread (its worker threads pile up per calling thread; the
# web server answers requests from a pool of threads), which freezes the whole service. So every solve runs on one
# dedicated thread, one at a time.
_SOLVER = ThreadPoolExecutor(max_workers=1, thread_name_prefix="highs")

FLAG_AR = {
    "regular": "في ميعادها حسب اللائحة",
    "summer_on_demand": "صيفي: لو الكلية فتحتها (حسب طلب الطلاب)",
    "training_summer": "التدريب في الإجازة الصيفية",
    "college_request": "التدريب في ترم أساسي: بموافقة الكلية",
    "graduation_request": "بطلب من الكلية",
    "open_request": "بطلب من الكلية",
    "late_request": "بطلب من الكلية",
}
PAPER_AR = "تسجيل ورقي: الساعات أقل من المطلوب بس جوه السماحية"
# A course the college opens for the student outside its semester is not on the registration system: it goes on paper.
OPENED_PAPER_AR = ("تسجيل ورقي: المادة مش في ترمها والكلية بتفتحهالك بطلب، فمش هتلاقيها على السيستم. "
                   "اطلبها من شئون الطلاب وسجّلها ورقي.")


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
            best_possible = math.floor(400 * pass_hours / now_hours + 1e-9) / 100 if now_hours else 0
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
    return {"passed": passed, "earned": earned, "cgpa": new_cgpa, "term_gpa": term_out, "assumption": assumed,
            "graded_hours": new_hours, "points": new_points}


def _streak_after(s: dict, cgpa: float | None, current: dict) -> int:
    """Academic warnings in a row once the current term ends with this cumulative GPA: a main semester under 2.00
    from the warning start adds one, a summer or a frozen semester changes nothing (article 25)."""
    r = d.rules()
    if cgpa is None or cgpa >= r["warning_gpa_threshold"]:
        return 0
    st = s["academic_status"]
    streak = st.get("consecutive_warning_semesters") or 0
    if current["term"] != "summer" and current["status"] != "frozen":
        streak = streak + 1 if st["main_semesters_completed"] + 1 >= r["warning_starts_after_main_semester"] else 0
    return streak


def _load_cap(cgpa: float | None, main_done: int, warned: int = 0) -> tuple[int, str]:
    """Max hours per main term for a GPA (article 13). Under 2.00 the first academic warning keeps the 14 of the
    lowest band; from the second warning in a row the cap is 12 (the team's reading of article 25)."""
    r = d.rules()
    if cgpa is None:
        return 21, "مفيش معدل تراكمي، فالحد 21 ساعة."
    if _on_warning(cgpa, main_done) and warned >= 2:
        return r["probation_max_credits"], (f"معدلك هيبقى {cgpa} (أقل من 2.00) وده إنذار تاني ورا بعض: "
                                            f"الحد {r['probation_max_credits']} ساعة.")
    if _on_warning(cgpa, main_done) and warned == 1:
        return _low_band_cap(), (f"معدلك هيبقى {cgpa} (أقل من 2.00) وده أول إنذار: الحد {_low_band_cap()} ساعة، "
                                 f"ولو فضل تحت 2.00 الترم الجاي يبقى إنذار تاني والحد {r['probation_max_credits']}.")
    band = next(b for b in r["max_credits_by_gpa"] if b["gpa_min"] <= cgpa < b["gpa_max"])
    return band["max_credits"], f"معدلك هيبقى {cgpa} فالحد {band['max_credits']} ساعة في الترم."


# ---------------------------------------------------------------- terms and courses to place

def _terms_after(current: dict, first_main: int, last_main: int, last_summer: bool | str = True) -> list[dict]:
    """Terms after the current one up to (and including) main semester `last_main` and the summer right after it
    (without `last_summer`, up to the semester only; with "training", that summer takes only the training)."""
    out, kind, year = [], current["term"], current["academic_year"]
    main = first_main - 1
    while True:
        kind = _NEXT[kind]
        if kind == "fall":
            y = int(year.split("-")[0]) + 1
            year = f"{y}-{y + 1}"
        if kind != "summer":
            main += 1
        if main > last_main or (kind == "summer" and main == last_main and not last_summer):
            return out  # past the target (a summer counts only right after a semester inside it)
        # A summer sits between main semester `main` and `main + 1`.
        out.append({"term": kind, "academic_year": year, "main": main if kind != "summer" else None,
                    "pos": main if kind != "summer" else main + 0.5,
                    "training_only": kind == "summer" and main == last_main and last_summer == "training"})
        if kind != "summer" and main == last_main:
            if kind == "spring" and last_summer:  # the summer right after the last semester is part of the target
                out.append({"term": "summer", "academic_year": year, "main": None, "pos": main + 0.5,
                            "training_only": last_summer == "training"})
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


def _options(course: dict, term: dict, planned: int, allow_summer: bool, request: bool = False) -> str | None:
    """How the course can be taken in this term (a flag), or None if it cannot. With `request`, a mandatory course
    outside its semester can be opened by a request to the college (the solver decides when that is allowed)."""
    kind = course["type"]
    if term["term"] == "summer":
        if kind == "training":
            return "training_summer"
        if kind == "project" or not allow_summer or term.get("training_only"):
            return None
        return "summer_on_demand"
    if kind == "training":
        return "college_request"
    if kind in ("elective", "project"):
        # Electives run in both semesters; projects can be taken in fall or spring (in order, see
        # rules.project_order), so a student with time can wait until the hours are complete.
        return "regular"
    in_term = (planned % 2 == 1) == (term["term"] == "fall")
    if in_term:
        return "regular"
    return "graduation_request" if request else None


# ---------------------------------------------------------------- the integer program

def _caps(terms: list[dict], cap: int, hi: int, hi_from: int | None, warned: int = 0) -> list[int | None]:
    """Hour cap of each term: `cap`, or `hi` from main semester number `hi_from` (counted among these terms) on.
    Summers get None (they have their own limit).

    The low band (GPA under 2.00, 14 hours) holds through the first academic warning: with the GPA unchanged, each
    main semester from the warning start adds a warning (`warned`: warnings in a row before the first of these
    terms), and from the second in a row the cap is 12.
    """
    r = d.rules()
    out, mains = [], 0
    for t in terms:
        if t["term"] == "summer":
            out.append(None)
            continue
        c = cap
        if cap == _low_band_cap() and warned >= 2:
            c = r["probation_max_credits"]
        out.append(hi if hi_from is not None and mains >= hi_from else c)
        mains += 1
        warned = warned + 1 if t["main"] >= r["warning_starts_after_main_semester"] else 0
    return out


def _solve(passed: set[str], earned: int, cap: int, terms: list[dict], last_main: int, allow_summer: bool,
           paper: bool = True, request: bool = True, hi: int = 21, hi_from: int | None = None, warned: int = 0,
           anchor: frozenset = frozenset()):
    """Place every remaining course in a term. Returns {code: (term index, flag)} or None if infeasible.

    `anchor`: (code, term, academic year) placements of an earlier plan (the plan without a what-if). Many layouts
    cost the same, so without it a what-if could reshuffle courses it has nothing to do with; a course away from its
    anchored term costs a tiny bit more (all of them together less than the smallest real cost difference, 0.5), so
    among equally good plans the one closest to the earlier plan wins.

    Levers: `paper` lets projects use their hours tolerance (paper registration), `request` allows a course outside
    its semester in the last two semesters (the graduation one and the one right before it, by a request to the
    college so the student graduates on time), and `hi_from` raises the cap to `hi` from that main semester.
    """
    caps = _caps(terms, cap, hi, hi_from, warned)
    allc = d.courses()
    required, pools = _to_place(passed)
    if not terms:  # no term left in this horizon
        return None if required or pools else {}
    items = [(c, c["planned_semester"], None) for c in required]
    for i, p in enumerate(pools):
        items += [(c, p["planned"], i) for c in p["candidates"]]

    var = []  # (item index, term index, flag)
    cost = []
    nudge = 0.4 / (len(items) + 1) if anchor else 0.0
    for ii, (c, planned, _) in enumerate(items):
        for ti, t in enumerate(terms):
            flag = _options(c, t, planned, allow_summer, request)
            if not flag:
                continue
            var.append((ii, ti, flag))
            cost.append(abs(t["pos"] - planned) + {"summer_on_demand": COST_SUMMER_COURSE,
                                                   "college_request": COST_TRAINING_IN_MAIN,
                                                   "graduation_request": COST_GRADUATION_REQUEST}.get(flag, 0)
                        + (COST_SUMMER_AFTER_LAST if t["pos"] > last_main and (
                            flag == "summer_on_demand"
                            # a training too, unless that summer is its own place (ARI 371 after semester 8 in 4 years)
                            or (flag == "training_summer" and t["pos"] > planned + 0.5)) else 0)
                        + (nudge if (c["code"], t["term"], t["academic_year"]) not in anchor else 0))
    summers = [ti for ti, t in enumerate(terms) if t["term"] == "summer"]
    mains = [ti for ti, t in enumerate(terms) if t["term"] != "summer"]
    n_x = len(var)
    # Placements of a project that could be short of its full hours (only with `paper`).
    paper_ks = [k for k, (ii, _, _) in enumerate(var)
                if paper and d.hours_needed(items[ii][0])[1] < d.hours_needed(items[ii][0])[0]
                and d.hours_needed(items[ii][0])[0] > earned]
    # Extra variables: "summer used" per summer, per main term "has courses" and "hours under 12", then
    # one "paper registration" per project placement above.
    n_s = n_x + len(summers)
    n_m = n_s + 2 * len(mains)
    n_p = n_m + len(paper_ks)
    low_band = _low_band_cap()
    paper_load_terms = [ti for ti in mains if caps[ti] == low_band]
    n_w = n_p + len(paper_load_terms)
    # One "graduation semester" variable per main term: the last semester with courses, the only one that may
    # go below 12 hours (on paper).
    n_g = n_w + len(mains)
    # Hours the graduation semester is under 12 (allowed on paper, at a cost so 12 is kept when possible).
    n_o = n_g + len(mains)
    # One "opened for you" per main term: the student has nothing that runs, so the college opens a course (the
    # term then has only that course).
    n = n_o + len(mains)
    cost += [COST_SUMMER_TERM] * len(summers) + [0, COST_UNDER_MIN_HOUR] * len(mains)
    cost += [COST_PAPER_REGISTRATION] * len(paper_ks)
    cost += [COST_PAPER_LOAD] * len(paper_load_terms)
    cost += [0] * len(mains) + [COST_GRAD_UNDER_MIN_HOUR] * len(mains) + [0] * len(mains)

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
        for pre in d.prereqs(allc[code_of[ii]]):
            if pre in passed:
                continue
            if pre not in item_of:
                return None
            before = [k2 for k2 in by_item.get(item_of[pre], []) if var[k2][1] < ti]
            add({k: 1, **{k2: -1 for k2 in before}}, -np.inf, 0)

    # Credit-hour thresholds (trainings and projects): enough hours earned before that term.
    credits = [allc[code_of[ii]]["credits"] for ii, _, _ in var]
    for k, (ii, ti, _) in enumerate(var):
        full, least = d.hours_needed(allc[code_of[ii]])
        need = least if paper else full
        if need <= earned:
            continue
        coefs = {k2: -credits[k2] for k2 in range(n_x) if var[k2][1] < ti and credits[k2]}
        add({**coefs, k: need}, -np.inf, earned)
        if k in paper_ks:
            # Short of the full hours only if the paper-registration variable is on.
            add({**coefs, k: full, n_m + paper_ks.index(k): -full}, -np.inf, earned)

    # Load: main terms up to the GPA cap; summers up to 6 credit hours (training has none).
    max_summer = d.rules()["summer"]["max_credits"]
    min_load = d.rules()["min_credits_main_semester"]
    for ti, t in enumerate(terms):
        ks = [k for k in range(n_x) if var[k][1] == ti]
        if t["term"] == "summer":
            courses_k = [k for k in ks if var[k][2] == "summer_on_demand"]
            if courses_k:
                si = n_x + summers.index(ti)
                add({**{k: credits[k] for k in courses_k}, si: -max_summer}, -np.inf, 0)
        elif ks:
            active = n_s + 2 * mains.index(ti)
            if ti in paper_load_terms:
                # Up to 14 on the system, or 15 on paper when every course that term is a 3-credit course.
                w = n_p + paper_load_terms.index(ti)
                add({**{k: credits[k] for k in ks}, w: -(PAPER_MAX_LOW_GPA - caps[ti])}, -np.inf, caps[ti])
                for k in ks:
                    if credits[k] not in (0, PAPER_COURSE_CREDITS):
                        add({k: 1, w: 1}, -np.inf, 1)
            else:
                add({k: credits[k] for k in ks}, -np.inf, caps[ti])
            add({**{k: 1 for k in ks}, active: -len(ks)}, -np.inf, 0)  # any course -> active

    # Minimum load: every main semester with courses has 12 hours or more, except the graduation semester.
    # A shortfall elsewhere is allowed only at a high cost (council approval), so it is used only when the
    # available courses cannot reach 12.
    for i, ti in enumerate(mains):
        ks = [k for k in range(n_x) if var[k][1] == ti]
        active, short, grad, grad_short = n_s + 2 * i, n_s + 2 * i + 1, n_w + i, n_g + i
        add({**{k: 1 for k in ks}, active: -1}, 0, np.inf)  # active only with courses
        add({**{k: credits[k] for k in ks}, short: 1, grad_short: 1, active: -min_load}, 0, np.inf)
        add({grad_short: 1, grad: -min_load}, -np.inf, 0)  # only the graduation semester has this allowance
        add({grad: 1, active: -1}, -np.inf, 0)  # the graduation semester has courses
        for later in mains[i + 1:]:  # ... and nothing comes after it
            add({grad: 1, n_s + 2 * mains.index(later): 1}, -np.inf, 1)
        if i + 1 < len(mains):  # no empty semester before a semester with courses
            add({active: 1, n_s + 2 * (i + 1): -1}, 0, np.inf)
    if mains:
        add({n_w + i: 1 for i in range(len(mains))}, -np.inf, 1)

    # A course outside its semester, by a request to the college: in the last two semesters (the graduation one and
    # the one right before it, decided 2026-10-20); in any semester for a course the student is behind on (past its
    # plan semester, decided 2026-10-20); or alone in a semester where nothing else runs.
    for i, ti in enumerate(mains):
        ks = [k for k in range(n_x) if var[k][1] == ti]
        reqs = [k for k in ks if var[k][2] == "graduation_request"]
        if not reqs:
            continue
        add({k: 1 for k in reqs}, 0, MAX_GRADUATION_REQUESTS)
        next_is_grad = {n_w + i + 1: -1} if i + 1 < len(mains) else {}
        for k in reqs:
            if terms[ti]["main"] > items[var[k][0]][1]:
                continue  # behind on it: the college can open it in any semester
            add({k: 1, n_w + i: -1, **next_is_grad, n_o + i: -1}, -np.inf, 0)
        for k in ks:
            if var[k][2] != "graduation_request":
                add({k: 1, n_o + i: 1}, -np.inf, 1)
    # A summer has courses only if the main semester before it does (no empty semester before a summer either).
    for si in summers:
        if si - 1 in mains:
            prev = n_s + 2 * mains.index(si - 1)
            for k in range(n_x):
                if var[k][1] == si:
                    add({k: 1, prev: -1}, -np.inf, 0)

    if not lo:
        return {}
    A = coo_matrix((vals, (rows, cols)), shape=(len(lo), n)).tocsr()
    upper = np.ones(n)
    for i in range(len(mains)):
        upper[n_s + 2 * i + 1] = min_load  # the shortfall variables count hours
        upper[n_g + i] = min_load
    res = _SOLVER.submit(milp, np.array(cost, dtype=float), integrality=np.ones(n), bounds=Bounds(0, upper),
                         constraints=LinearConstraint(A, lo, hi),
                         options={"time_limit": 10, "mip_rel_gap": 0.02}).result()
    if res.x is None or res.status not in (0, 1):
        return None
    return {code_of[ii]: (ti, flag) for k, (ii, ti, flag) in enumerate(var) if res.x[k] > 0.5}


# ---------------------------------------------------------------- the tool

# ---------------------------------------------------------------- why a target is not possible

def _summer_hours() -> int:
    return d.rules()["summer"]["max_credits"]  # the most a summer can add
_TERM_WORD = {"fall": ("خريف", "Fall"), "spring": ("ربيع", "Spring"), "summer": ("صيفي", "Summer")}


def _short(t: dict) -> dict:
    """'خريف 2027' / 'Fall 2027': the calendar year the semester falls in."""
    start = int(t["academic_year"].split("-")[0])
    year = start if t["term"] == "fall" else start + 1
    ar, en = _TERM_WORD[t["term"]]
    return {"ar": f"{ar} {year}", "en": f"{en} {year}"}


def _name(code: str) -> dict:
    """The course's name without its code: students know courses by name."""
    c = d.courses()[code]
    return {"ar": c["name_ar"], "en": c.get("name_en") or code}


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
    deadline = max(i for i, t in enumerate(terms) if t["pos"] <= last_main + 0.5)

    # The most hours the student can have earned before term i.
    before, total = [], proj["earned"]
    for t, c in zip(terms, _caps(terms, cap, _top_cap(), None, proj.get("warned", 0))):
        before.append(total)
        total += ((_summer_hours() if allow_summer else 0) if c is None
                  else PAPER_MAX_LOW_GPA if c == _low_band_cap() else c)

    required, pools = _to_place(passed)
    memo: dict[str, tuple] = {}

    def earliest(code: str):
        """(term index or None, cause) where cause explains what decided it."""
        if code in memo:
            return memo[code]
        memo[code] = (None, ("cycle",))
        c = allc[code]
        lower, held_by = 0, None
        for p in d.prereqs(c):
            if p in passed:
                continue
            pi, _ = earliest(p)
            if pi is None:
                memo[code] = (None, ("prereq", p))
                return memo[code]
            if pi + 1 > lower:
                lower, held_by = pi + 1, p
        _, need = d.hours_needed(c)  # with the projects' tolerance
        planned = c["planned_semester"] or 7
        short_of = None  # (term index, hours) of the last term it ran in but the hours were not enough
        for i in range(lower, len(terms)):
            main = terms[i]["main"]
            if not _options(c, terms[i], planned, allow_summer,
                            main is not None and (main in (last_main - 1, last_main) or main > planned)):
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
        for p in d.prereqs(allc[root]):
            if p in retaking:
                ar.append(f"إنت سقطت في {_name(p)['ar']} قبل كده وبتعيدها الترم ده، فاللي بعدها اتأخر.")
                en.append(f"You failed {_name(p)['en']} before and are retaking it this semester, so what follows it is delayed.")
        if root in failed_codes:
            ar.append(f"إنت سقطت في {_name(root)['ar']} ولازم تعيدها.")
            en.append(f"You failed {_name(root)['en']} and must retake it.")
        if rcause[0] == "credits":
            _, least, k, have = rcause
            full, _ = d.hours_needed(allc[root])
            paper_ar = f" (أو {least} بتسجيل ورقي)" if least < full else ""
            paper_en = f" (or {least} with paper registration)" if least < full else ""
            ar.append(f"{_name(root)['ar']} محتاج {full} ساعة ناجحة{paper_ar} قبل ما تسجله، وأقصى اللي هتوصله قبل "
                      f"{_short(terms[k])['ar']} هو {have} ساعة، فأول فرصة ليه {when(ri)['ar']}.")
            en.append(f"{_name(root)['en']} needs {full} passed credit hours{paper_en}, and the most you can have before "
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
            # Course names, not codes: students know the courses by name.
            links_ar = " ← ".join(allc[c]["name_ar"] for c in reversed(chain))
            links_en = " → ".join(allc[c].get("name_en") or c for c in reversed(chain))
            ar.append(f"وكل مادة في السلسلة دي لازم تيجي بعد اللي قبلها: {links_ar}، فـ {_name(code)['ar']} مش هتلحق قبل {when(i)['ar']}.")
            en.append(f"Each course in this chain must follow the one before it ({links_en}), "
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
    # The hour limit in words: with a GPA under 2.00 it is 14 (15 on paper) until the second academic warning.
    r = d.rules()
    if cap == _low_band_cap():
        lim_ar = (f"حد {cap} ساعة (أو {PAPER_MAX_LOW_GPA} ورقي)، ومن تاني إنذار ورا بعض {r['probation_max_credits']} "
                  f"لو المعدل فضل تحت 2.00")
        lim_en = (f"{cap} hours ({PAPER_MAX_LOW_GPA} on paper), then {r['probation_max_credits']} from the second academic "
                  f"warning in a row if the GPA stays under 2.00")
    else:
        lim_ar, lim_en = f"حد {cap} ساعة في الترم", f"{cap} per semester"
    if left > room:
        return {"code": "hours", "left": left, "room": room,
                "ar": f"فاضلك {left} ساعة، وأقصى اللي تقدر تسجله لحد {_short(terms[deadline])['ar']} هو {room} ساعة "
                      f"({lim_ar}{summer_ar}).",
                "en": f"You have {left} credit hours left, and the most you can register by {_short(terms[deadline])['en']} "
                      f"is {room} ({lim_en}{summer_en})."}
    return {"code": "fit",
            "ar": f"المواد الفاضلة مش هتتوزع على الترمات لحد {_short(terms[deadline])['ar']}: كل مادة ليها ترمها "
                  f"ومتطلباتها، و{lim_ar}{summer_ar}.",
            "en": f"The remaining courses do not fit into the semesters up to {_short(terms[deadline])['en']}: each course has "
                  f"its own semester and prerequisites, and the limit is {lim_en}{summer_en}."}


def _count(n: int, one: str, two: str, few: str, many: str) -> str:
    return one if n == 1 else two if n == 2 else f"{n} {few}" if n <= 10 else f"{n} {many}"


def _term_label(t: dict) -> dict:
    return {"ar": f"{TERM_AR[t['term']]} {t['academic_year']}", "en": f"{TERM_EN[t['term']]} {t['academic_year']}"}


def _raise(proj: dict, cap: int, hi_from: int | None) -> tuple[int, int | None]:
    """(cap the plan rises to, from which main semester). A route's GPA condition raises it to the top band; a student
    on academic warning cannot stay under 2.00 for good (article 25: dismissal after a run of main semesters under
    2.00), so the plan keeps the warning cap (14, then 12) only until the GPA can reach 2.00, then the 2.00-2.99
    band."""
    if hi_from is None and proj.get("recover_from") is not None and cap <= _low_band_cap():
        return _mid_cap(), proj["recover_from"]
    return _top_cap(), hi_from


def _plan_for(proj: dict, cap: int, current: dict, main_now: int, last_main: int, allow_summer: bool,
              paper: bool = True, request: bool = True, hi_from: int | None = None, last_summer: bool | str = True):
    hi, hi_from = _raise(proj, cap, hi_from)
    return _plan_cached(frozenset(proj["passed"]), proj["earned"], cap, current["term"], current["academic_year"],
                        main_now, last_main, allow_summer, paper, request, hi_from, last_summer, hi,
                        proj.get("warned", 0), proj.get("anchor", frozenset()))


@lru_cache(maxsize=2048)
def _plan_cached(passed: frozenset, earned: int, cap: int, term: str, year: str, main_now: int, last_main: int,
                 allow_summer: bool, paper: bool, request: bool, hi_from: int | None, last_summer: bool | str = True,
                 hi: int | None = None, warned: int = 0, anchor: frozenset = frozenset()):
    """Same inputs, same plan: switching targets back and forth on the page reuses earlier solves."""
    terms = _terms_after({"term": term, "academic_year": year}, main_now + 1, last_main, last_summer)
    placed = _solve(set(passed), earned, cap, terms, last_main, allow_summer, paper, request, hi or _top_cap(), hi_from,
                    warned, anchor)
    return terms, placed


def _low_band_cap() -> int:
    """The hour cap of the lowest GPA band (under 2.00, not on warning): 14."""
    return min(b["max_credits"] for b in d.rules()["max_credits_by_gpa"])


def _top_cap() -> int:
    return max(b["max_credits"] for b in d.rules()["max_credits_by_gpa"])


def _mid_cap() -> int:
    """The cap of the band that starts at 2.00 (2.00-2.99): 18."""
    return next(b["max_credits"] for b in d.rules()["max_credits_by_gpa"] if b["gpa_min"] == d.rules()["warning_gpa_threshold"])


# ---------------------------------------------------------------- routes to a target

def _gpa_points(s: dict, failed: list[str]) -> tuple[float, float, float, float]:
    """(graded hours before this term, their points, graded hours this term, of which passed)."""
    gp, allc = _grade_points(), d.courses()
    best, cur = d.best_attempts(s), d.current_courses(s)
    cur_codes = [c["code"] for c in cur]
    old = [a for code, a in best.items() if a["grade"] in gp and code not in cur_codes]
    graded_now = [c for c in cur if allc.get(c["code"], {}).get("graded", True) and c["credits"] > 0]
    return (sum(a["credits"] for a in old), sum(gp[a["grade"]] * a["credits"] for a in old),
            sum(c["credits"] for c in graded_now), sum(c["credits"] for c in graded_now if c["code"] not in failed))


def _gpa_lever(s: dict, failed: list[str], expected_term_gpa: float | None, cap: int) -> dict | None:
    """What it takes to reach the top GPA band (cumulative 3.00 -> 21 hours), or None if it cannot help.

    From next semester if a reachable GPA this semester gets the cumulative to 3.00; otherwise from the one
    after, assuming 4.00 this semester and a full load of graded courses next semester.
    """
    band = max(d.rules()["max_credits_by_gpa"], key=lambda b: b["max_credits"])
    top, target = band["max_credits"], band["gpa_min"]
    if cap >= top or expected_term_gpa is not None:  # already at the top, or the what-if fixed this term's GPA
        return None
    hours, points, now_h, pass_h = _gpa_points(s, failed)
    up = lambda x: max(0.0, math.ceil(x * 100 - 1e-9) / 100)
    if now_h and pass_h:
        # Points needed this term; the GPA counts to two decimals (like _projection), as in grades_needed().
        need = (target - 0.005) * (hours + now_h) - points
        if need / pass_h <= 4.0 + 1e-9:
            term_gpa = up(need / now_h)
            return {"from": 0, "cap": top, "term_gpa": term_gpa,
                    "ar": f"معدلك التراكمي يوصل {target:.2f} في آخر الترم ده (يعني معدل الترم ده {term_gpa:.2f} أو أكتر)، "
                          f"فتقدر تسجّل {top} ساعة من الترم الجاي.",
                    "en": f"Get your cumulative GPA to {target:.2f} by the end of this semester (a semester GPA of "
                          f"{term_gpa:.2f} or more), so you can register {top} hours from next semester."}
    # One semester later: 4.00 on what is passed now, then a full load next semester.
    h1, p1 = hours + now_h, points + 4.0 * pass_h
    nxt = ((target - 0.005) * (h1 + cap) - p1) / cap if cap else 99
    if nxt <= 4.0:
        nxt = up(nxt)
        return {"from": 1, "cap": top, "term_gpa": 4.0, "next_term_gpa": nxt,
                "ar": f"مش هتلحق توصل {target:.2f} الترم ده. لو جبت 4.00 الترم ده و{nxt:.2f} أو أكتر الترم الجاي، "
                      f"تقدر تسجّل {top} ساعة من الترم اللي بعده.",
                "en": f"You cannot reach {target:.2f} this semester. With 4.00 this semester and {nxt:.2f} or more next "
                      f"semester, you can register {top} hours from the semester after."}
    return None


SUMMER_LEVER = {"ar": "تحضر ترم صيفي (لحد 6 ساعات، لو الكلية فتحت المواد).",
                "en": "Attend summer semesters (up to 6 hours, if the faculty opens the courses)."}


def _route(proj, cap, current, main_now, last_main, allow_summer, gpa_lever):
    """Ways to reach the target.

    As the student is going first (paper registration and a graduation request are allowed but cost extra,
    so they are used only when needed). If that does not reach it, each thing the student can change on its
    own (summer if it was off, a higher GPA band), then both. Returns (status, routes) where status is
    "feasible", "conditional" or "impossible" and each route is (terms, placed, conditions, hi_from), the
    first being the one shown.
    """
    terms, placed = _plan_for(proj, cap, current, main_now, last_main, allow_summer)
    if placed is not None:
        return "feasible", [(terms, placed, [], None)]
    levers = (["summer"] if not allow_summer else []) + (["gpa"] if gpa_lever else [])

    def attempt(combo):
        summer = allow_summer or "summer" in combo
        hi_from = gpa_lever["from"] if "gpa" in combo else None
        t, p = _plan_for(proj, cap, current, main_now, last_main, summer, True, True, hi_from)
        if p is None:
            return None
        conditions = []
        if "gpa" in combo:
            conditions.append({"kind": "gpa", "ar": gpa_lever["ar"], "en": gpa_lever["en"]})
        if "summer" in combo:
            conditions.append({"kind": "summer", **SUMMER_LEVER})
        return t, p, conditions, hi_from

    routes = [r for r in (attempt([lv]) for lv in levers) if r]
    if not routes and len(levers) == 2:
        routes = [r for r in [attempt(levers)] if r]
    return ("conditional", routes) if routes else ("impossible", [])


def _risk(proj, current, main_now, last_main, allow_summer, now_gpa: float | None) -> dict:
    """What happens to the target if the GPA drops one band this term, from where it is now: from 3.00+ to under
    3.00 (18 hours); from 2.00-2.99 to under 2.00 (14 hours, a first academic warning at most); already under 2.00
    and staying there (14 on a first warning, 12 from the second in a row)."""
    r = d.rules()
    cgpa = now_gpa if now_gpa is not None else proj["cgpa"]
    if cgpa is not None and cgpa >= 3:
        low = next(b["max_credits"] for b in r["max_credits_by_gpa"] if b["gpa_min"] <= 2.99 < b["gpa_max"])
        on_warning = False
        if_ar, if_en = "لو معدلك التراكمي نزل تحت 3.00", "If your cumulative GPA falls below 3.00"
    else:
        proj = {**proj, "warned": proj["streak_if_low"]}
        low, _ = _load_cap(1.99, main_now, proj["warned"])
        on_warning = _on_warning(1.99, main_now)
        if cgpa is not None and cgpa < 2:
            if_ar, if_en = "لو معدلك التراكمي فضل تحت 2.00 الترم ده", "If your cumulative GPA stays below 2.00 this term"
        else:
            if_ar, if_en = "لو معدلك التراكمي نزل تحت 2.00", "If your cumulative GPA falls below 2.00"
    terms, placed = _plan_for(proj, low, current, main_now, last_main, allow_summer, True, True)
    ok = placed is not None
    warn_ar, warn_en = (" وهتبقى تحت الإنذار", " and you would be on academic warning") if on_warning else ("", "")
    return {"cap": low, "still_possible": ok,
            "ar": f"{if_ar} حدك هيبقى {low} ساعة{warn_ar}، " + ("والهدف ده هيفضل ممكن." if ok else "والهدف ده مش هيلحق."),
            "en": f"{if_en} your limit becomes {low} hours{warn_en}, "
                  + ("and this target stays possible." if ok else "and this target would no longer be reachable.")}


def _earliest(proj, cap, current, main_now, allow_summer, start: int):
    """The earliest main semester the student can graduate in with this cap (None within the 10-year limit)."""
    limit = 2 * d.rules()["max_study_years"]
    # From the current semester: the summer right after it may be enough.
    for last in range(max(start, main_now), limit + 1):
        if not _terms_after(current, main_now + 1, last):
            continue
        terms, placed = _plan_for(proj, cap, current, main_now, last, allow_summer)
        if placed is None:
            continue
        # Courses in the summer after this semester: finishing them by the semester is earlier, if it fits. The
        # training keeps its usual place in that summer, so the date does not move when only the training is left.
        if terms[-1]["term"] == "summer" and any(ti == len(terms) - 1 and flag == "summer_on_demand"
                                                 for ti, flag in placed.values()):
            t2, p2 = _plan_for(proj, cap, current, main_now, last, allow_summer, last_summer="training")
            if p2:
                return last, t2, p2
        return last, terms, placed
    return None, None, None


def _gpa_below_2(s: dict, proj: dict, cap: int, current: dict) -> dict | None:
    """With a cumulative GPA under 2.00 after this term the plan's graduation date only holds if the GPA comes up:
    graduation needs 2.00 (article 26), and a run of main semesters in a row under 2.00 (rules:
    dismissal_after_consecutive_low_semesters, article 25) means dismissal. How many semesters are left before that,
    the semester GPA that gets back to 2.00, and `recover_after`: how many semesters the plan keeps the warning
    cap before it may assume 2.00 (None when 2.00 cannot be reached before the limit)."""
    r = d.rules()
    need = r["graduation"]["min_cgpa"]
    cgpa = proj["cgpa"]
    if cgpa is None or cgpa >= need:
        return None
    streak = _streak_after(s, cgpa, current)
    limit = r["dismissal_after_consecutive_low_semesters"]
    left = limit - streak
    graded, pts = proj["graded_hours"], proj["points"]
    up = lambda x: math.ceil(x * 100 - 1e-9) / 100
    ar = [f"معدلك هيبقى {cgpa}، والتخرج محتاج {need:.2f} على الأقل، فميعاد التخرج ده بشرط إن معدلك يوصل {need:.2f}."]
    en = [f"Your GPA will be {cgpa}, and graduation needs at least {need:.2f}, so this date holds only "
          f"if your GPA reaches {need:.2f}."]
    out = {"cgpa": cgpa, "semesters_left": max(0, left), "dismissal_reached": left <= 0, "recover_after": None}
    if left <= 0:
        ar.append(f"وإنت وصلت لحد الفصل ({_warnings(limit)} ورا بعض): القرار لمجلس الكلية "
                  f"(فرصة أخيرة لفصلين)، فكلّم مرشدك.")
        en.append(f"You have reached the dismissal limit ({limit} academic warnings in a row): the Faculty "
                  f"Council decides (a last chance of two semesters), so talk to your advisor.")
    else:
        next_gpa = up((need * (graded + cap) - pts) / cap)
        out["next_term_gpa"] = next_gpa
        if streak:
            had = "وبكده ده هيبقى أول إنذار ليك" if streak == 1 else f"وبكده هتبقى واخد {_warnings(streak)} ورا بعض"
            ar.append(f"{had}، ولو خدت {_warnings(left)} كمان هتتفصل من البرنامج. "
                      f"فلازم تعلّي معدلك الترم الجاي عشان الإنذار ميوصلكش للفصل.")
            en.append(f"That makes {streak} academic warning{'s' if streak > 1 else ''} in a row, and {left} more "
                      f"would mean dismissal from the program. Raise your GPA next semester so the warning does not "
                      f"lead to dismissal.")
        else:
            ar.append(f"لسه مفيش إنذار، بس لو فضل أقل من {need:.2f} هتاخد إنذار، و{_warnings(limit)} ورا بعض "
                      f"يعني هتتفصل من البرنامج. فعلّي معدلك بدري.")
            en.append(f"There is no warning yet, but if it stays under {need:.2f} you will get one, and {limit} "
                      f"warnings in a row mean dismissal from the program. Raise your GPA early.")
        if next_gpa <= 4.0:
            out["recover_after"] = 1
            ar.append(f"عشان توصل {need:.2f} الترم الجاي محتاج معدل ترم {next_gpa:.2f} أو أكتر في {cap} ساعة.")
            en.append(f"To reach {need:.2f} next semester you need a semester GPA of {next_gpa:.2f} or more over {cap} hours.")
        else:
            avg = up((need * (graded + left * cap) - pts) / (left * cap))
            out["average_term_gpa"] = avg
            if avg <= 4.0:
                out["recover_after"] = left
                ar.append(f"مش هتلحق توصل {need:.2f} في ترم واحد، بس توصلها لو متوسط معدلك {avg:.2f} أو أكتر "
                          f"في الـ {left} ترمات الجاية ({cap} ساعة في كل ترم).")
                en.append(f"You cannot reach {need:.2f} in one semester, but you can with an average of {avg:.2f} or more "
                          f"over the next {left} semesters ({cap} hours each).")
            else:
                ar.append(f"وحتى بـ 4.00 مش هتوصل {need:.2f} قبل حد الفصل، فكلّم مرشدك عن الفرصة الأخيرة من مجلس الكلية.")
                en.append(f"Even with 4.00 you cannot reach {need:.2f} before the dismissal limit, so talk to your advisor "
                          f"about a last chance from the Faculty Council.")
    out.update({"ar": " ".join(ar), "en": " ".join(en)})
    return out


def _warnings(n: int) -> str:
    return {1: "إنذار واحد", 2: "إنذارين"}.get(n, f"{n} إنذارات")


IMPROVE_GRADE = "B"  # the grade assumed in a course retaken to raise the GPA (the last grade counts, article 30)
FLAG_AR["improvement"] = "تحسين: إعادة مادة ناجح فيها عشان المعدل يوصل 2.00"


def _improvement_plan(s: dict, proj: dict, current: dict, main_now: int, last_main: int, allow_summer: bool,
                      cap: int, target_years) -> dict:
    """Every course is passed but the cumulative GPA is under 2.00, so the student cannot graduate yet (article 26).
    Once the program is finished, any passed course can be improved until the GPA reaches 2.00 (article 30 item 2),
    so the plan picks the fewest courses that get there with a B and places them in the coming terms."""
    gp, allc, r = _grade_points(), d.courses(), d.rules()
    need = r["graduation"]["min_cgpa"]
    best = d.best_attempts(s)
    cur = d.current_courses(s)
    cur_codes = {c["code"] for c in cur}
    # Graded hours once the current term is graded, as in _projection; their points give the projected GPA.
    hours = (sum(a["credits"] for code, a in best.items() if a["grade"] in gp and code not in cur_codes)
             + sum(c["credits"] for c in cur if allc.get(c["code"], {}).get("graded", True) and c["credits"] > 0))
    points = proj["points"] if abs(proj["graded_hours"] - hours) < 1e-9 else proj["cgpa"] * hours
    target = gp[IMPROVE_GRADE]
    options = sorted(((code, (target - gp[a["grade"]]) * a["credits"]) for code, a in best.items()
                      if code not in cur_codes and a["grade"] in gp and gp[a["grade"]] < target
                      and allc[code]["type"] not in ("project", "training") and d.passed(a)),
                     key=lambda x: -x[1])
    picks = []
    for code, gain in options:
        if (points + sum(g for _, g in picks)) / hours >= need:
            break
        picks.append((code, gain))
    gpa_after = round((points + sum(g for _, g in picks)) / hours, 2)
    why = {"code": "gpa_below_2",
           "ar": f"خلّصت كل المواد، بس معدلك التراكمي هيبقى {proj['cgpa']} والتخرج محتاج {need:.2f} على الأقل.",
           "en": f"Every course is done, but your cumulative GPA will be {proj['cgpa']} and graduation needs at least "
                 f"{need:.2f}."}
    base = {"feasible": False, "status": "impossible", "reason": why["ar"], "reason_code": "gpa_below_2", "why": why,
            "summer_courses": [], "college_requests": []}
    if gpa_after < need:
        return {**base, "terms": [], "graduation_term": None,
                "explanation": why["ar"] + f" وحتى لو حسّنت كل موادك لـ {IMPROVE_GRADE} مش هيوصل {need:.2f}، فكلّم مرشدك."}

    # The improvement courses in the coming terms: each in a term it runs in, within the hour limits. Each term takes
    # the fewest best courses that still get to 2.00; a main semester where none of them runs takes the best course
    # that does, because a semester cannot stay empty (that course raises the GPA too).
    terms = _terms_after(current, main_now + 1, main_now + 8)
    gain_of, placed, gained = dict(options), {}, 0.0
    reached = lambda g: (points + g) / hours >= need - 1e-9
    runs = lambda code, t: _options(allc[code], t, allc[code]["planned_semester"] or 0, allow_summer) is not None
    for ti, t in enumerate(terms):
        if reached(gained):
            break
        if t["term"] == "summer" and not allow_summer:
            continue
        limit, load = (_summer_hours() if t["term"] == "summer" else cap), 0
        todo, g = [], gained
        for code, gain in options:
            if reached(g):
                break
            if code not in placed:
                todo.append(code)
                g += gain
        for code in todo:
            if runs(code, t) and load + allc[code]["credits"] <= limit:
                placed[code] = ti
                load += allc[code]["credits"]
                gained += gain_of[code]
        if not load and t["term"] != "summer":
            for code, gain in options:
                if code not in placed and runs(code, t) and allc[code]["credits"] <= limit:
                    placed[code] = ti
                    gained += gain
                    break
    picks = [(code, gain_of[code]) for code in placed]
    gpa_after = round((points + gained) / hours, 2)
    rows = []
    for ti, t in enumerate(terms[:max(placed.values()) + 1]):
        cs = sorted(code for code, k in placed.items() if k == ti)
        rows.append({**_term_label(t), "term": t["term"], "academic_year": t["academic_year"], "main_semester": t["main"],
                     "credits": sum(allc[c]["credits"] for c in cs), "max_credits": cap if t["term"] != "summer" else None,
                     "courses": [{"code": c, "name_ar": allc[c]["name_ar"], "name_en": allc[c].get("name_en"),
                                  "credits": allc[c]["credits"], "type": allc[c]["type"],
                                  "planned_semester": allc[c]["planned_semester"], "flag": "improvement",
                                  "flag_ar": FLAG_AR["improvement"], "current_grade": best[c]["grade"]} for c in cs]})
    rows = [row for row in rows if row["courses"] or row["term"] != "summer"]
    # The 12-hour minimum, as in the main plan: the graduation semester may be under it on paper, others need approval.
    min_load = r["min_credits_main_semester"]
    mains = [row for row in rows if row["term"] != "summer"]
    for row in mains:
        if row["credits"] >= min_load:
            continue
        if row is mains[-1]:
            row["below_minimum_paper"] = True
            row["below_minimum_ar"] = f"ترم التخرج أقل من {min_load} ساعة: بيتسجل ورقي."
        else:
            row["warning"] = f"أقل من الحد الأدنى ({min_load} ساعة) في ترم تحسين، فمحتاج موافقة المجلس."
    grad_t = terms[max(placed.values())]
    on_time = grad_t["pos"] <= last_main
    grad = _term_label(grad_t)
    names = "، ".join(f"{_name(c)['ar']} (تقديرك {best[c]['grade']})" for c, _ in picks)
    text = (f"{why['ar']} تقدر تحسّن أي مواد درستها لحد ما توصل {need:.2f} (مادة 30). لو أعدت {names} وجبت فيها "
            f"{IMPROVE_GRADE} على الأقل، معدلك هيبقى {gpa_after} وتتخرج في {grad['ar']}.")
    if not on_time:
        text += f" وده بعد هدف {target_years} سنين."
    return {**base, "feasible": on_time, "status": "feasible" if on_time else "impossible",
            "terms": rows, "graduation_term": grad, "explanation": text,
            "improvement": {"courses": [c for c, _ in picks], "assumed_grade": IMPROVE_GRADE, "gpa_after": gpa_after}}


FROZEN_AR = ("إنت موقف قيدك الترم ده، فمش متحسب من سنين الهدف، والخطة من أول ترم هترجع فيه. "
             "وقف القيد بيتطلب من شئون الطلاب وليه رسوم إدارية.")
FROZEN_EN = ("Your enrollment is frozen this semester, so it does not count in the target, and the plan starts with the "
             "semester you return. A freeze is requested from student affairs and has an administrative fee.")


def current_or_frozen(s: dict) -> dict | None:
    """The term the plan starts after: the one in progress, or the latest term if the student froze it (وقف قيد)."""
    current = next((t for t in s["terms"] if t["status"] == "in_progress"), None)
    if current is None and s["terms"] and s["terms"][-1]["status"] == "frozen":
        current = s["terms"][-1]
    return current


def build_graduation_plan(student_id: str, target_years: float = 5, allow_summer: bool = True,
                          failed_courses: list[str] | None = None, expected_term_gpa: float | None = None,
                          with_risk: bool = True, anchor_plan: dict | None = None) -> dict:
    """A term-by-term plan to graduate within `target_years` (4, 4.5 or 5) of enrollment.

    What-if inputs: `failed_courses` (current-term courses the student fails) and `expected_term_gpa`; `anchor_plan`
    is the plan without the what-if, which the what-if keeps to wherever it does not have to differ.
    A frozen semester (وقف قيد) does not count: the target is 8 / 9 / 10 semesters of study. A student frozen now gets
    the plan from the semester they return, worked out from the last semester they studied, with the frozen
    semester shown first.
    """
    out = _build_graduation_plan(student_id, target_years, allow_summer, failed_courses, expected_term_gpa, with_risk,
                                 anchor_plan)
    if out.get("found") and out.get("frozen") and out.get("terms"):
        f = out["frozen"]
        out["terms"] = [{"ar": f["term"]["ar"], "en": f["term"]["en"], "term": f["term_kind"],
                         "academic_year": f["academic_year"], "main_semester": None, "credits": 0, "max_credits": None,
                         "courses": [], "frozen": True, "frozen_ar": "موقف قيدك الترم ده"}] + (out.get("terms") or [])
        out["explanation"] = FROZEN_AR + " " + out.get("explanation", "")
    return out


def _build_graduation_plan(student_id: str, target_years: float = 5, allow_summer: bool = True,
                           failed_courses: list[str] | None = None, expected_term_gpa: float | None = None,
                           with_risk: bool = True, anchor_plan: dict | None = None) -> dict:
    s = d.get_student(student_id)
    if not s:
        return d.not_found("الطالب", student_id)
    if target_years not in TARGETS:
        return {"found": False, "error": "الهدف لازم يكون 4 أو 4.5 أو 5 سنين."}
    target_years = int(target_years) if float(target_years).is_integer() else target_years  # 5.0 -> 5
    current = current_or_frozen(s)
    if not current:
        return {"found": False, "error": "مفيش ترم حالي مسجل للطالب."}
    frozen = current["status"] == "frozen"
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
    # Main semesters done once the current term ends: a summer is not a main semester, and neither is a frozen one.
    main_now = s["academic_status"]["main_semesters_completed"] + (0 if current["term"] == "summer" or frozen else 1)
    proj["warned"] = _streak_after(s, proj["cgpa"], current)
    # A what-if keeps every course it does not have to move where the plan without it put it.
    proj["anchor"] = frozenset((c["code"], t["term"], t["academic_year"])
                               for t in (anchor_plan or {}).get("terms") or [] for c in t["courses"])
    proj["streak_if_low"] = _streak_after(s, 1.99, current)
    cap, cap_why = _load_cap(proj["cgpa"], main_now, proj["warned"])
    last_main = TARGETS[target_years]
    gpa_warning = _gpa_below_2(s, proj, cap, current)
    proj["recover_from"] = (gpa_warning or {}).get("recover_after")

    out = {
        "found": True, "student_id": s["student_id"], "target_years": target_years, "allow_summer": allow_summer,
        "current_term": _term_label(current), "current_main_semester": main_now,
        **({"frozen": {"term": _term_label(current), "term_kind": current["term"], "academic_year": current["academic_year"],
                       "ar": FROZEN_AR, "en": FROZEN_EN}} if frozen else {}),
        "what_if": {"failed_courses": [d.course_label(c) for c in failed], "expected_term_gpa": expected_term_gpa},
        "after_this_term": {"cumulative_gpa": proj["cgpa"], "term_gpa": proj["term_gpa"],
                            "earned_hours": proj["earned"], "max_credits": cap, "why": cap_why},
        "assumptions": [a for a in (
            proj["assumption"],
            "حد الساعات محسوب من معدلك بعد الترم ده، ومفترض إنه هيفضل كده لحد التخرج." if proj["recover_from"] is None
            else (f"إنت تحت الإنذار، والمعدل مينفعش يفضل تحت 2.00، فالخطة حاطة {cap} ساعة في أول "
                  f"{_count(proj['recover_from'], 'ترم', 'ترمين', 'ترمات', 'ترم')} لحد ما معدلك يوصل 2.00، وبعدها {_mid_cap()} ساعة."),
            "كل مادة بتتدرّس في ترمها حسب الخطة، والاختياري في الترمين.",
            "الصيفي: أي مادة غير المشاريع ممكن تتفتح لو الطلاب طلبوها، بحد أقصى 6 ساعات." if allow_summer else
            "من غير صيفي (غير التدريب).",
        ) if a],
        "articles": [ARTICLES["load"], ARTICLES["training"], ARTICLES["project"]],
    }

    remaining_required, pools = _to_place(proj["passed"])
    if not remaining_required and not pools and proj["cgpa"] is not None \
            and proj["cgpa"] < d.rules()["graduation"]["min_cgpa"]:
        out["articles"].append(ARTICLES["improve"])
        out["assumptions"].append(f"مواد التحسين محسوبة على إنك هتجيب فيها {IMPROVE_GRADE} على الأقل، والتقدير الأخير هو اللي بيتحسب.")
        return {**out, **_improvement_plan(s, proj, current, main_now, last_main, allow_summer, cap, target_years)}
    if not remaining_required and not pools:
        # Graduating at the end of this term: within the target if this term is (a summer belongs to the semester
        # before it).
        on_time = main_now <= last_main
        if frozen:  # nothing this term and nothing left: every requirement is already met
            studied = [t for t in s["terms"] if t["status"] == "published"]
            grad, text = (_term_label(studied[-1]) if studied else None,
                          "خلّصت كل متطلبات التخرج، فكلّم شئون الطلاب عن إجراءات التخرج.")
        else:
            grad, text = _term_label(current), "لو نجحت في مواد الترم ده هتتخرج في آخره."
        out = {**out, "feasible": on_time, "graduation_term": grad, "terms": [],
               "status": "feasible" if on_time else "impossible",
               "explanation": text + ("" if on_time else f" وده بعد هدف {target_years} سنين.")}
        if not on_time:
            out["reason_code"] = "past"
            out["why"] = {"code": "past", "ar": f"إنت دلوقتي في الترم رقم {main_now}، وهدف {target_years} سنين آخره الترم رقم {last_main}.",
                          "en": f"You are in semester {main_now} now, and the {target_years}-year target ends with semester {last_main}."}
            out["reason"] = out["why"]["ar"]
        return out

    # Article 25: under 2.00 the GPA has to come back before the run of main semesters under 2.00 reaches the
    # dismissal limit. When it cannot (even 4.00 is too late) or the limit is already reached, there is no ordinary
    # plan: with 80% of the hours the Faculty Council may give one last chance of two main semesters (item 5), so the
    # plan must finish within them; without those hours the student is dismissed and there is no graduation plan.
    if gpa_warning and (gpa_warning["dismissal_reached"] or gpa_warning["recover_after"] is None):
        need80 = math.ceil(d.program()["program"]["total_credits"] * 0.8)
        out["articles"].append(ARTICLES["warning"])
        if proj["earned"] < need80:
            why = {"code": "dismissal",
                   "ar": f"معدلك مش هيلحق يوصل 2.00 قبل حد الفصل ({d.rules()['dismissal_after_consecutive_low_semesters']} "
                         f"إنذارات ورا بعض)، والفرصة الأخيرة من مجلس الكلية محتاجة {need80} ساعة "
                         f"ناجحة ومعاك {proj['earned']}، فمفيش خطة تخرج. كلّم مرشدك.",
                   "en": f"Your GPA cannot reach 2.00 before the dismissal limit "
                         f"({d.rules()['dismissal_after_consecutive_low_semesters']} in a row, "
                         f"academic warnings), and the Faculty Council's last chance needs {need80} passed hours (you have "
                         f"{proj['earned']}), so there is no graduation plan. Talk to your advisor."}
            return {**out, "feasible": False, "status": "impossible", "graduation_term": None, "terms": [],
                    "reason_code": "dismissal", "why": why, "reason": why["ar"],
                    "explanation": why["ar"] + " " + gpa_warning["ar"], "gpa_warning": gpa_warning}
        last_main = min(last_main, main_now + 2)
        out["last_chance"] = {
            "ar": f"إنت عدّيت {need80} ساعة (80%)، فمجلس الكلية ممكن يديك فرصة أخيرة لترمين أساسيين ترفع فيهم معدلك "
                  f"لـ 2.00 وتخلّص متطلبات التخرج، فالخطة لازم تخلص في الترمين دول.",
            "en": f"You have passed {need80} hours (80%), so the Faculty Council may give you a last chance of two main "
                  f"semesters to raise your GPA to 2.00 and finish the graduation requirements: the plan "
                  f"has to finish within them."}
        out["assumptions"].append(out["last_chance"]["ar"])

    if not _terms_after(current, main_now + 1, last_main):  # courses are left, and the target has no term left
        feasible, terms, placed, reason_code = False, None, None, "past"
        why = {"code": "past",
               "ar": f"إنت دلوقتي في الترم رقم {main_now}، وهدف {target_years} سنين آخره الترم رقم {last_main}"
                     + ("، ولسه فاضلك مواد بعد الترم ده." if last_main == main_now else "."),
               "en": f"You are in semester {main_now} now, and the {target_years}-year target ends with semester {last_main}"
                     + (", but you still have courses left after this semester." if last_main == main_now else ".")}
    else:
        gpa_lever = _gpa_lever(s, failed, expected_term_gpa, cap)
        status, routes = _route(proj, cap, current, main_now, last_main, allow_summer, gpa_lever)
        terms, placed, conditions, hi_from = routes[0] if routes else (None, None, [], None)
        feasible = status == "feasible"
        reason_code = None if feasible else "constraints"
        why = None
        if not feasible:
            best = d.best_attempts(s)
            failed_codes = {c for c, a in best.items() if a["grade"] in ("F", "FP")} | set(failed)
            retaking = {c for c in cur_codes if c not in failed and best.get(c, {}).get("grade") in ("F", "FP")}
            why = _why_not(proj, cap, current, main_now, last_main, allow_summer, failed_codes, target_years, retaking)
    reason = why["ar"] if why else None
    if reason_code == "past":
        status, conditions, hi_from = "impossible", [], None
    out["status"] = status
    if status == "conditional":
        # Not as things stand, but reachable: the plan below is the one that meets the conditions.
        out.update({"feasible": False, "conditions": conditions, "reason": reason, "reason_code": reason_code,
                    "why": why,
                    # Every way that works on its own, e.g. "a summer" or "a 3.00 GPA" (the plan shows the first).
                    "routes": [{"conditions": r[2], "graduation_term": _term_label(
                        max((r[0][k] for k, _ in r[1].values()), key=lambda t: (t["academic_year"], "fsu".index(t["term"][0]))))}
                        for r in routes]})
        if any(c["kind"] == "gpa" for c in conditions):
            out["gpa_needed"] = {k: v for k, v in gpa_lever.items() if k in ("from", "cap", "term_gpa", "next_term_gpa")}
    elif not feasible:
        last, terms, placed = _earliest(proj, cap, current, main_now, allow_summer, last_main + 1)
        out["feasible"] = False
        out["reason"], out["reason_code"], out["why"] = reason, reason_code, why
        if last is None:
            return {**out, "terms": [], "graduation_term": None,
                    "explanation": f"{reason} ومفيش خطة تخرج خلال الحد الأقصى للدراسة."}
        out["earliest_main_semester"] = last
    else:
        out["feasible"] = True
        if with_risk:
            out["risk"] = _risk(proj, current, main_now, last_main, allow_summer, s["academic_status"]["cumulative_gpa"])

    caps = _caps(terms, cap, *_raise(proj, cap, hi_from), proj.get("warned", 0))
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
                     "max_credits": caps[ti] if t["term"] != "summer" else None, "courses": courses})
    _number_electives(rows, proj["passed"])
    earned_before = proj["earned"]
    for r in rows:
        for c in r["courses"]:
            need, _ = d.hours_needed(d.courses()[c["code"]])
            if need and earned_before < need:
                c["paper_registration"] = True
                c["paper_note_ar"] = f"{PAPER_AR} (معاك {earned_before} من {need} ساعة)."
                c["hours_before"] = earned_before
                c["hours_needed"] = need
        earned_before += r["credits"]
    for r in rows:
        if r["max_credits"] is not None and r["credits"] > r["max_credits"]:
            r["paper_load"] = True
            r["paper_load_ar"] = (f"تسجيل ورقي: {r['credits']} ساعة ({r['credits'] // PAPER_COURSE_CREDITS} مواد كل مادة "
                                  f"{PAPER_COURSE_CREDITS} ساعات) فوق حد السيستم {r['max_credits']}.")
    last_i = max((i for i, r in enumerate(rows) if r["courses"]), default=-1)
    rows = rows[:last_i + 1]
    grad = rows[-1] if rows else None
    min_load = d.rules()["min_credits_main_semester"]
    last_main_row = max((i for i, r in enumerate(rows) if r["term"] != "summer"), default=-1)
    for i, r in enumerate(rows):
        if r["term"] == "summer" or r["credits"] >= min_load:
            continue
        if i == last_main_row:
            # The graduation semester may be under 12 hours, registered on paper.
            r["below_minimum_paper"] = True
            r["below_minimum_ar"] = f"ترم التخرج أقل من {min_load} ساعة: بيتسجل ورقي."
        else:
            r["warning"] = (f"أقل من الحد الأدنى ({min_load} ساعة) لأن مفيش مواد متاحة كفاية في الترم ده، "
                            f"فمحتاج موافقة المجلس.")

    # A course outside its semester in the last two semesters is a graduation request; earlier, a request for a course
    # the student is behind on, otherwise the college opens it because nothing runs.
    before_last = max((i for i, r in enumerate(rows) if r["term"] != "summer" and i < last_main_row), default=-1)
    for i, r in enumerate(rows):
        for c in r["courses"]:
            if c["flag"] == "graduation_request" and i not in (last_main_row, before_last):
                kind = "late_request" if r["main_semester"] > (c["planned_semester"] or 0) else "open_request"
                c["flag"], c["flag_ar"] = kind, FLAG_AR[kind]
            if c["flag"] in ("graduation_request", "open_request", "late_request"):
                c["paper_registration"], c["paper_opened"], c["paper_note_ar"] = True, True, OPENED_PAPER_AR
    summer_courses = [c["code"] for r in rows if r["term"] == "summer" for c in r["courses"]
                      if c["flag"] == "summer_on_demand"]
    requests = [c["code"] for r in rows for c in r["courses"]
                if c["flag"] in ("college_request", "graduation_request", "open_request", "late_request")]
    out.update({"graduation_term": {"ar": grad["ar"], "en": grad["en"]} if grad else None, "terms": rows,
                "summer_courses": summer_courses, "college_requests": requests})

    if gpa_warning:
        out["gpa_warning"] = gpa_warning
    goal = grades_needed(s["student_id"])
    if goal.get("found") and goal.get("below_two_now"):
        out["this_term_goal"] = {k: goal[k] for k in ("target", "term_gpa", "reachable", "dismissal_if_missed",
                                                      "warning_if_missed", "hours")}
    grad_txt = grad["ar"] if grad else ""
    extra = []
    if summer_courses:
        extra.append(f"{_count(len(summer_courses), 'مادة واحدة', 'مادتين', 'مواد', 'مادة')} في الصيفي (لو الكلية فتحتها)")
    if requests:
        extra.append(_count(len(requests), "طلب واحد للكلية", "طلبين للكلية", "طلبات للكلية", "طلب للكلية"))
    extra_txt = ("، ومحتاج " + " و".join(extra)) if extra else ""
    if out["feasible"]:
        out["explanation"] = f"تقدر تتخرج في {grad_txt} ({target_years} سنين){extra_txt}. {cap_why}"
    elif status == "conditional":
        conds = " و".join(c["ar"].rstrip(".") for c in conditions)
        out["explanation"] = (f"زي ما إنت ماشي مش هتلحق هدف {target_years} سنين ({reason}) بس تقدر تتخرج في {grad_txt} "
                              f"لو: {conds}.{(' ' + extra_txt.lstrip('، ')) if extra_txt else ''}")
    else:
        out["explanation"] = f"هدف {target_years} سنين مش ممكن: {reason} أقرب تخرج: {grad_txt}{extra_txt}. {cap_why}"
    if gpa_warning:
        out["explanation"] += " " + gpa_warning["ar"]
    return out


def _number_electives(rows: list[dict], passed: set[str]) -> None:
    """Give each elective in the plan the elective slot it fills (E1..E5 of its level's pool), in term order after
    the slots the student already filled. The plan picks one course of the pool only so the hours and prerequisites
    add up; the student chooses the course, so the page shows "Elective (n)" instead of that course."""
    slot_sem = {sl["slot"]: sl["semester"] for sl in d.program()["elective_slots"]}
    for pool in d.program()["elective_pools"]:
        free = sorted(pool["slots"], key=lambda sl: slot_sem[sl])[sum(c in passed for c in pool["courses"]):]
        mine = [c for r in rows for c in r["courses"] if c["type"] == "elective" and c["code"] in pool["courses"]]
        for c, sl in zip(mine, free):
            n = sl.lstrip("E")
            c.update({"elective_slot": sl, "elective_level": pool["level"],
                      "name_ar": f"مقرر اختياري ({n})", "name_en": f"Elective ({n})"})


def grades_needed(student_id: str, target_gpa: float | None = None) -> dict:
    """The semester GPA the student needs this term for the cumulative GPA to reach `target_gpa` (default: 2.00 for a
    student under it, otherwise 3.00, the 21-hour band), and one mix of grades in this term's courses that gets there,
    with the percentage each grade needs. Assumes every course of this term is passed and graded."""
    s = d.get_student(student_id)
    if not s:
        return d.not_found("الطالب", student_id)
    current = current_or_frozen(s)
    if not current or current["status"] == "frozen":
        return {"found": True, "student_id": student_id, "error": "مفيش مواد مسجلة الترم ده (أو القيد موقوف)."}
    r, gp, allc = d.rules(), _grade_points(), d.courses()
    cgpa = s["academic_status"]["cumulative_gpa"]
    two = r["graduation"]["min_cgpa"]
    target = float(target_gpa) if target_gpa else (two if cgpa is None or cgpa < two else 3.0)
    hours, points, now_h, _ = _gpa_points(s, [])
    graded = [c for c in d.current_courses(s) if allc.get(c["code"], {}).get("graded", True) and c["credits"] > 0]
    if not now_h:
        return {"found": True, "student_id": student_id, "error": "مفيش مواد بتقدير الترم ده."}
    # Points needed this term. The GPA counts to two decimals (like the projection above), so 1.995 is 2.00.
    need = (target - 0.005) * (hours + now_h) - points
    up = lambda x: max(0.0, math.ceil(x * 100 - 1e-9) / 100)
    term_gpa = up(need / now_h)
    reachable = term_gpa <= 4.0 + 1e-9
    warned = s["academic_status"]["consecutive_warning_semesters"]
    limit = r["dismissal_after_consecutive_low_semesters"]
    below = cgpa is not None and cgpa < two
    out = {"found": True, "student_id": student_id, "current_cgpa": cgpa, "target": round(target, 2),
           "term_gpa": term_gpa, "reachable": reachable, "hours": now_h, "below_two_now": below,
           "warnings_in_row": warned, "warning_if_missed": below and target <= two,
           "dismissal_if_missed": below and target <= two and warned + 1 >= limit}

    # One mix of grades: the lowest single grade that gets there in every course, then each course (smallest first)
    # one grade lower while the total still gets there, so the student sees where there is room.
    ladder = sorted({g: p for g, p in gp.items() if g not in ("A+", "DN")}.items(), key=lambda x: x[1])
    pct = {x["grade"]: x["min_percent"] for x in r.get("grade_scale", [])}
    if reachable:
        start = next(i for i, (_, p) in enumerate(ladder) if p >= term_gpa - 1e-9)
        pick = {c["code"]: start for c in graded}
        total = lambda: sum(ladder[pick[c["code"]]][1] * c["credits"] for c in graded)
        changed = True
        while changed:
            changed = False
            for c in sorted(graded, key=lambda c: c["credits"]):
                if pick[c["code"]] > 0:
                    pick[c["code"]] -= 1
                    if total() + 1e-9 >= need and ladder[pick[c["code"]]][1] >= gp["D"]:
                        changed = True
                    else:
                        pick[c["code"]] += 1
        out["courses"] = [{"code": c["code"], "name_ar": allc[c["code"]]["name_ar"], "credits": c["credits"],
                           "grade": ladder[pick[c["code"]]][0], "min_percent": pct.get(ladder[pick[c["code"]]][0])}
                          for c in graded]
        out["uniform_grade"] = ladder[start][0]
    else:
        # Not in one semester: A (4.00) in every course now, then what the next semester takes, at the hour limit
        # that GPA gives (as the plan's GPA route counts it).
        out["courses"] = [{"code": c["code"], "name_ar": allc[c["code"]]["name_ar"], "credits": c["credits"],
                           "grade": "A", "min_percent": pct.get("A")} for c in graded]
        after = round((points + 4.0 * now_h) / (hours + now_h), 2)
        main_now = s["academic_status"]["main_semesters_completed"] + 1
        cap, _ = _load_cap(after, main_now)
        nxt = up(((target - 0.005) * (hours + now_h + cap) - points - 4.0 * now_h) / cap)
        out.update({"gpa_after_this_term": after, "next_term_hours": cap,
                    "next_term_gpa": nxt if nxt <= 4.0 + 1e-9 else None})
    risk = (" ولو معدلك فضل تحت 2.00 هيبقى ده الإنذار رقم " + str(warned + 1) +
            (" يعني حد الفصل (القرار لمجلس الكلية)." if out["dismissal_if_missed"] else ".")) if out["warning_if_missed"] else ""
    if not reachable and out["next_term_gpa"] is not None:
        out["explanation"] = (f"مش هتلحق توصل {target:.2f} في ترم واحد: محتاج 4.00 الترم ده (يعني A في كل المواد، "
                              f"{pct.get('A')}% أو أكتر)، وبعدها معدل ترم {out['next_term_gpa']:.2f} أو أكتر الترم الجاي "
                              f"في {out['next_term_hours']} ساعة." + risk)
    elif not reachable:
        out["explanation"] = (f"حتى لو جبت 4.00 الترم ده والترم الجاي معدلك التراكمي مش هيوصل {target:.2f}."
                              + risk + " كلّم مرشدك عن خطة على أكتر من ترم.")
    else:
        lines = "، ".join(f"{c['code']} {c['grade']}" for c in out["courses"])
        out["explanation"] = (f"عشان معدلك التراكمي يوصل {target:.2f} آخر الترم ده محتاج معدل ترم {term_gpa:.2f} على الأقل "
                              f"في {now_h} ساعة، يعني تقريبًا {out['uniform_grade']} في كل المواد، أو مثلًا: {lines}."
                              + risk + " النسب هي أقل مجموع للتقدير ده.")
    return out


def plan_options(student_id: str, failed_courses: list[str] | None = None,
                 expected_term_gpa: float | None = None) -> dict:
    """Which targets are reachable, with and without summer: a 3 x 2 table for the plan page."""
    rows = []
    for years in TARGETS:
        cells = {}
        for summer in (False, True):
            p = build_graduation_plan(student_id, years, summer, failed_courses, expected_term_gpa, with_risk=False)
            if not p.get("found"):
                return p
            cells["with_summer" if summer else "without_summer"] = {
                "feasible": p["feasible"], "status": p.get("status", "feasible" if p["feasible"] else "impossible"),
                "conditions": p.get("conditions", []), "graduation_term": p["graduation_term"], "why": p.get("why"),
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
        return {"possible": c["feasible"], "status": c["status"], "graduation": (c["graduation_term"] or {}).get("ar"),
                "conditions": [x["ar"] for x in c["conditions"]], "why_not": (c.get("why") or {}).get("ar")}

    out = {
        "found": True, "target_years": years, "allow_summer": summer, "possible": p["feasible"],
        # feasible = as things stand; conditional = possible if the conditions are met; impossible = no route.
        "status": p.get("status"), "conditions": [c["ar"] for c in p.get("conditions", [])],
        "risk_if_gpa_drops": (p.get("risk") or {}).get("ar"),
        "graduation": (p["graduation_term"] or {}).get("ar"),
        "summer_courses": p.get("summer_courses", []), "college_requests": p.get("college_requests", []),
        # Courses registered on paper at student affairs (opened by request, or a project a few hours short).
        "paper_registration": [{"code": c["code"], "term": t["ar"], "why": c["paper_note_ar"]}
                               for t in p.get("terms", []) for c in t["courses"] if c.get("paper_registration")],
        "credit_cap_per_semester": p["after_this_term"]["max_credits"],
        "all_targets": [{"target_years": o["target_years"], "with_summer": cell(o["with_summer"]),
                         "without_summer": cell(o["without_summer"])} for o in opts],
        "source": "نفس حسبة صفحة خطة التخرج في الموقع",
    }
    if not p["feasible"]:
        out["why_not"] = (p.get("why") or {}).get("ar")
    if p.get("status") == "impossible":
        out["earliest_graduation"] = out["graduation"]
    out["explanation"] = p["explanation"]
    return out
