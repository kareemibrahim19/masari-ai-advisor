"""Checks for the graduation planner against the six mock students. Run from the repo root:
    .venv/Scripts/python.exe ai/tests/test_planner.py
Every plan is re-checked here against the regulations, independently of the solver.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "chatbot"))
from tools import _data as d  # noqa: E402
from tools.planner import build_graduation_plan, plan_options  # noqa: E402

BY = {s["persona"]: s["student_id"] for s in d.students().values()}
EXC, PROB, NEAR, FAILPRE, NEW, RETAKE = (BY[k] for k in (
    "excellent", "probation", "near_graduation", "failed_prerequisite", "new_student", "retake"))
failures = []


def check(name, cond, got=None):
    if not cond:
        failures.append(f"{name}: {got}")
    print(("ok   " if cond else "FAIL ") + name)


def violations(sid: str, plan: dict, failed=()) -> list[str]:
    """Rules the plan breaks (empty = valid)."""
    s, allc, r = d.get_student(sid), d.courses(), d.rules()
    cur = {c["code"] for c in d.current_courses(s)}
    passed = {c for c, a in d.best_attempts(s).items() if d.passed(a)} | (cur - set(failed))
    passed -= set(failed)
    earned = sum(allc[c]["credits"] for c in passed if c in allc)
    out, seen = [], set(passed)
    for i, t in enumerate(plan["terms"]):
        codes = [c["code"] for c in t["courses"]]
        summer = t["term"] == "summer"
        for c in t["courses"]:
            course = allc[c["code"]]
            for p in d.prereqs(course):
                if p not in seen:
                    out.append(f"{c['code']} before its prerequisite {p} ({t['en']})")
            need, least = d.hours_needed(course)
            if earned < least:
                out.append(f"{c['code']} needs {least} hours (with tolerance), has {earned}")
            if (earned < need) != bool(c.get("paper_registration")):
                out.append(f"{c['code']} paper registration flag wrong at {earned}/{need}")
            if summer and course["type"] == "project":
                out.append(f"project {c['code']} in summer")
            # Mandatory courses run in their plan semester; projects can be in fall or spring (in order).
            if not summer and course["type"] == "mandatory":
                in_term = (course["planned_semester"] % 2 == 1) == (t["term"] == "fall")
                if not in_term and c["flag"] != "graduation_request":
                    out.append(f"{c['code']} outside its term without a request ({t['en']})")
                if not in_term and i != len(plan["terms"]) - 1:
                    out.append(f"graduation request {c['code']} not in the last term")
            if c["code"] in seen:
                out.append(f"{c['code']} twice")
        if summer and t["credits"] > r["summer"]["max_credits"]:
            out.append(f"more than {r['summer']['max_credits']} hours in {t['en']}")
        if not summer and t["credits"] > t["max_credits"]:
            out.append(f"{t['credits']} hours over the cap in {t['en']}")
        seen |= set(codes)
        earned += sum(allc[c]["credits"] for c in codes)
    for c in allc.values():
        if c["type"] != "elective" and c["code"] not in seen:
            out.append(f"{c['code']} never placed")
    for pool in d.program()["elective_pools"]:
        if sum(1 for c in pool["courses"] if c in seen) < pool["choose"]:
            out.append(f"level {pool['level']} electives short")
    if earned < r["graduation"]["min_credits"]:
        out.append(f"only {earned} hours at graduation")
    return out


# Every student, every target, with and without summer: a valid plan (or the earliest valid one).
for name, sid in BY.items():
    for years in (4, 4.5, 5):
        for summer in (True, False):
            p = build_graduation_plan(sid, years, summer)
            v = violations(sid, p) if p.get("terms") else []
            check(f"valid plan {name} {years}y summer={summer}", p["found"] and not v, v or p.get("error"))
            summer_condition = any(c["kind"] == "summer" for c in p.get("conditions", []))
            if not summer and not summer_condition:
                bad = [c["code"] for t in p.get("terms", []) for c in t["courses"] if c["flag"] == "summer_on_demand"]
                check(f"no summer courses when summer is off ({name} {years}y)", not bad, bad)

# New student: 5 years is the regulation plan, 4 years needs summer (the BAS 115 -> CSE 452 chain).
p = build_graduation_plan(NEW, 5)
check("new student 5y feasible without summer courses", p["feasible"] and not p["summer_courses"], p["explanation"])
check("new student 5y graduates spring 2030-2031", p["graduation_term"]["en"] == "Spring 2030-2031", p["graduation_term"])
moved = [c["code"] for t in p["terms"] if t["main_semester"]
         for c in t["courses"] if c["type"] != "elective" and c["planned_semester"] != t["main_semester"]]
check("new student 5y keeps every course in its plan semester", not moved, moved)
check("new student 4y impossible without summer", not build_graduation_plan(NEW, 4, False)["feasible"])
p = build_graduation_plan(NEW, 4, True)
check("new student 4y possible with summer", p["feasible"] and p["summer_courses"], p["explanation"])

# Near graduation: past the 4-year mark, finishes this spring.
p = build_graduation_plan(NEAR, 4)
check("near graduation 4y is past", not p["feasible"] and p["why"]["code"] == "past", p.get("why"))

# Why a target is not possible: a plain reason in both languages.
p = build_graduation_plan(EXC, 4.5)
at = {c["code"]: t["en"] for t in p["terms"] for c in t["courses"] if c["type"] == "project"}
check("excellent 4.5y possible: projects in fall, spring, fall (any main semester, in order)",
      p["status"] == "feasible" and at.get("ARI 381", "").startswith("Fall"), at)
p = build_graduation_plan(EXC, 4)
check("excellent 4y blocked by the project chain 381 -> 481 -> 482 (project 1 needs 92 hours)",
      p["why"]["code"] == "course" and p["why"]["root"] == "ARI 381"
      and p["why"]["chain"] == ["ARI 381", "ARI 481", "ARI 482"] and "92" in p["why"]["ar"] and "96" in p["why"]["en"],
      p.get("why"))
p = build_graduation_plan(EXC, 5, failed_courses=["BAS 216"])
check("what-if failure named in the reason (by name)", "الإحصاء وتحليل البيانات" in p["why"]["ar"]
      and "سقطت" in p["why"]["ar"] and "BAS" not in p["why"]["ar"], p.get("why"))
p = build_graduation_plan(PROB, 5)
check("retake this term named in the reason (by name)", "الجبر الخطي" in p["why"]["ar"] and "بتعيدها" in p["why"]["ar"],
      p.get("why"))
p = build_graduation_plan(NEW, 4.5)
paper = [c["code"] for t in p["terms"] for c in t["courses"] if c.get("paper_registration")]
check("new student 4.5y waits for the hours instead of paper registration", p["feasible"] and not paper, paper)

# Paper registration when there is no time to wait: only project 1 left, one semester to go.
from tools import planner as P  # noqa: E402
everything_but_381 = {c for c in d.courses() if c != "ARI 381"}
one_term = P._terms_after({"term": "fall", "academic_year": "2028-2029"}, 10, 10)
check("project 1 at 93 hours: not without paper registration",
      P._solve(everything_but_381, 93, 18, one_term, 10, True, paper=False) is None)
check("project 1 at 93 hours: yes with paper registration (92+)",
      P._solve(everything_but_381, 93, 18, one_term, 10, True, paper=True) == {"ARI 381": (0, "regular")})
check("project 1 at 91 hours: not even with paper registration",
      P._solve(everything_but_381, 91, 18, one_term, 10, True, paper=True) is None)

# What-if: failing a prerequisite chain course delays graduation.
base = build_graduation_plan(EXC, 5)
p = build_graduation_plan(EXC, 5, failed_courses=["BAS 216"])
check("excellent on track for 5y", base["feasible"], base["explanation"])
check("failing BAS 216 breaks the 5y target", not p["feasible"] and not violations(EXC, p, ["BAS 216"]), p["explanation"])
check("failed course is retaken", any(c["code"] == "BAS 216" for t in p["terms"] for c in t["courses"]))

# What-if: term GPA moves the hour cap.
p = build_graduation_plan(PROB, 5, expected_term_gpa=0.5)
check("low term GPA keeps probation cap 12", p["after_this_term"]["max_credits"] == 12, p["after_this_term"])
p = build_graduation_plan(PROB, 5)
check("retaking failed courses lifts probation GPA over 2", p["after_this_term"]["cumulative_gpa"] >= 2, p["after_this_term"])
p = build_graduation_plan(EXC, 5, failed_courses=["BAS 216", "CSE 221", "CSE 251", "ECE 223", "ECE 234"], expected_term_gpa=3)
check("impossible term GPA rejected", not p["found"] and p["max_term_gpa"] == 0.5, p)
check("failing a course not in this term rejected", not build_graduation_plan(EXC, 5, failed_courses=["CSE 351"])["found"])
check("bad target rejected", not build_graduation_plan(EXC, 3)["found"])

# Routes: when the target is out of reach as things stand, what would make it possible.
p = build_graduation_plan(NEW, 4.5, False)
kinds = sorted(c["kind"] for r in p.get("routes", []) for c in r["conditions"])
check("new student 4.5y without summer: possible with a summer or with a 3.00 GPA", p["status"] == "conditional"
      and kinds == ["gpa", "summer"] and not violations(NEW, p), (p.get("status"), kinds))
check("GPA route says the semester GPA needed", p["gpa_needed"]["term_gpa"] == 3.0 if "gpa_needed" in p else
      any("3.00" in c["ar"] for r in p["routes"] for c in r["conditions"] if c["kind"] == "gpa"), p.get("routes"))
p = build_graduation_plan(NEW, 4, True)
check("feasible plans carry the low-GPA risk", p["status"] == "feasible" and "2.00" in p["risk"]["ar"]
      and p["risk"]["cap"] == 14, p.get("risk"))
p = build_graduation_plan(PROB, 4.5, True)
check("no route for probation (3.00 out of reach in two semesters)", p["status"] == "impossible" and not p.get("routes"),
      p.get("status"))
for name, sid in BY.items():
    for years in (4, 4.5, 5):
        for summer in (True, False):
            p = build_graduation_plan(sid, years, summer)
            ok = (p["status"] == "feasible") == p["feasible"] and (p["status"] != "conditional" or p["conditions"])
            check(f"status consistent ({name} {years}y summer={summer})", ok, p.get("status"))

# Projects: 1 before 2 before 3, never two in the same semester.
for name, sid in BY.items():
    for years in (4, 4.5, 5):
        for summer in (True, False):
            p = build_graduation_plan(sid, years, summer)
            at = {c["code"]: i for i, t in enumerate(p.get("terms", [])) for c in t["courses"]}
            seq = [at[c] for c in ("ARI 381", "ARI 481", "ARI 482") if c in at]
            check(f"projects in order, one per semester ({name} {years}y summer={summer})", seq == sorted(set(seq)), at)

# Options table
o = plan_options(NEW)
check("options table 3 targets", [r["target_years"] for r in o["options"]] == [4, 4.5, 5], o)

print(f"\n{len(failures)} failure(s)")
for f in failures:
    print(" -", f)
sys.exit(1 if failures else 0)
