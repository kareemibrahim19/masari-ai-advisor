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
    res = milp(np.array(cost, dtype=float), integrality=np.ones(n), bounds=Bounds(0, upper),
               constraints=LinearConstraint(A, lo, hi), options={"time_limit": 10})
    if res.x is None or res.status not in (0, 1):
        return None
    return {code_of[ii]: (ti, flag) for k, (ii, ti, flag) in enumerate(var) if res.x[k] > 0.5}


# ---------------------------------------------------------------- the tool

def _count(n: int, one: str, two: str, few: str, many: str) -> str:
    return one if n == 1 else two if n == 2 else f"{n} {few}" if n <= 10 else f"{n} {many}"


def _term_label(t: dict) -> dict:
    return {"ar": f"{TERM_AR[t['term']]} {t['academic_year']}", "en": f"{TERM_EN[t['term']]} {t['academic_year']}"}


def _plan_for(proj: dict, cap: int, current: dict, main_now: int, last_main: int, allow_summer: bool):
    terms = _terms_after(current, main_now + 1, last_main)
    placed = _solve(proj["passed"], proj["earned"], cap, terms, last_main, allow_summer)
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

    if last_main < main_now:
        feasible, terms, placed, reason_code = False, None, None, "past"
        reason = f"انت دلوقتي في الترم الأساسي رقم {main_now}، والهدف ده آخره الترم {last_main}."
    else:
        terms, placed = _plan_for(proj, cap, current, main_now, last_main, allow_summer)
        feasible = placed is not None
        reason_code = None if feasible else "constraints"
        reason = None if feasible else "القيود (المتطلبات، ترم كل مادة، حد الساعات، والصيفي) مش هتسمح بالهدف ده."

    if not feasible:
        last, terms, placed = _earliest(proj, cap, current, main_now, allow_summer, last_main + 1)
        out["feasible"] = False
        out["reason"], out["reason_code"] = reason, reason_code
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
                "feasible": p["feasible"], "graduation_term": p["graduation_term"],
                "summer_courses": len(p.get("summer_courses", [])), "college_requests": len(p.get("college_requests", []))}
        rows.append({"target_years": years, **cells})
    return {"found": True, "student_id": student_id, "options": rows}
