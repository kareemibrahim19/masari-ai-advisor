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
    last_main = max((i for i, t in enumerate(plan["terms"]) if t["term"] != "summer" and t["courses"]), default=-1)
    for i, t in enumerate(plan["terms"]):
        codes = [c["code"] for c in t["courses"]]
        if t["term"] != "summer" and not codes and i < len(plan["terms"]) - 1:
            out.append(f"empty semester {t['en']} before graduation")
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
            # Mandatory courses run in their plan semester; projects can be in fall or spring (in order). Outside its
            # semester only by request: in the graduation semester (the last one with courses), or alone in a
            # semester where nothing else runs for the student (the college opens it).
            if not summer and course["type"] == "mandatory":
                in_term = (course["planned_semester"] % 2 == 1) == (t["term"] == "fall")
                if not in_term and c["flag"] not in ("graduation_request", "open_request"):
                    out.append(f"{c['code']} outside its term without a request ({t['en']})")
                if not in_term and c["flag"] == "graduation_request" and i != last_main:
                    out.append(f"graduation request {c['code']} not in the graduation semester")
                if not in_term and c["flag"] == "open_request" and len(t["courses"]) != 1:
                    out.append(f"opened course {c['code']} is not alone in {t['en']}")
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
p = build_graduation_plan(EXC, 4.5, failed_courses=["BAS 216"])  # 5 years works since the summer after semester 10 counts
check("what-if failure named in the reason (by name)", "الإحصاء وتحليل البيانات" in p["why"]["ar"]
      and "سقطت" in p["why"]["ar"] and "BAS" not in p["why"]["ar"], p.get("why"))
p = build_graduation_plan(PROB, 4.5)  # 5 years works since the summer after semester 10 counts
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
p = build_graduation_plan(EXC, 4.5, failed_courses=["BAS 216"])  # 5 years works since the summer after semester 10 counts
check("excellent on track for 5y", base["feasible"], base["explanation"])
check("failing BAS 216 breaks the 4.5y target", not p["feasible"] and not violations(EXC, p, ["BAS 216"]), p["explanation"])
check("failed course is retaken", any(c["code"] == "BAS 216" for t in p["terms"] for c in t["courses"]))

# What-if: term GPA moves the hour cap.
p = build_graduation_plan(PROB, 5, expected_term_gpa=0.5)
check("low term GPA keeps probation cap 12", p["after_this_term"]["max_credits"] == 12, p["after_this_term"])
p = build_graduation_plan(PROB, 4.5)  # 5 years works since the summer after semester 10 counts
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

# GPA under 2.00, not on warning: 14 hours (15 on paper, five 3-credit courses), then 12 once on warning.
p = build_graduation_plan(NEW, 5, True, [], 1.5)
main_caps = [t["max_credits"] for t in p["terms"] if t["term"] != "summer"]
check("low GPA: 14 next semester, then 12 on warning", main_caps[0] == 14 and set(main_caps[1:]) == {12}, main_caps)
check("low GPA reason explains 14 then 12", "12" in p["why"]["ar"] and "الإنذار" in p["why"]["ar"], p.get("why"))
two_term = P._terms_after({"term": "fall", "academic_year": "2026-2027"}, 2, 2)  # one main semester: spring, semester 2
five_threes = {c for c in d.courses()} - {"BAS 012", "BAS 022", "BAS 032", "CSE 042", "PDE 051"}
placed = P._solve(five_threes, 145, 14, two_term, 2, False)
check("15 hours on paper when all five are 3-credit courses", placed is not None and len(placed) == 5, placed)
check("not 16: one more 1-credit course breaks the rule",
      P._solve(five_threes - {"UNR 021"}, 144, 14, two_term, 2, False) is None)

# 12 hours minimum in every semester; only the graduation semester may be less (on paper).
for name, sid in BY.items():
    for years in (4, 4.5, 5):
        for summer in (True, False):
            p = build_graduation_plan(sid, years, summer)
            mains = [t for t in p.get("terms", []) if t["term"] != "summer"]
            bad = [t["en"] for t in mains[:-1] if t["credits"] < 12 and not t.get("warning")]
            last = mains[-1] if mains else None
            ok = not bad and (not last or last["credits"] >= 12 or last.get("below_minimum_paper"))
            check(f"12-hour minimum except the graduation semester ({name} {years}y summer={summer})", ok, (bad, last and last["credits"]))

p = build_graduation_plan(NEW, 5, True)
last = [t for t in p["terms"] if t["term"] != "summer"][-1]
check("graduation semester kept at 12 when possible (no paper registration for nothing)",
      last["credits"] >= 12 and not last.get("below_minimum_paper"), (last["en"], last["credits"]))
p = build_graduation_plan(FAILPRE, 4.5, False)  # at 5 years the summer after semester 10 is the route
last = [t for t in p["terms"] if t["term"] != "summer"][-1]
check("one course left at the end: graduation semester under 12 on paper", last["credits"] < 12
      and last.get("below_minimum_paper"), (last["en"], last["credits"]))

# Asked during a summer: the summer is not a main semester, so the next fall is the next one (not one later).
import copy  # noqa: E402
s = copy.deepcopy(d.get_student(EXC))
s["student_id"] = "test-summer"
done = s["academic_status"]["main_semesters_completed"]
last_year = [t for t in s["terms"] if t["status"] == "published"][-1]["academic_year"]
s["terms"] = [t for t in s["terms"] if t["status"] == "published" and not (t["term"] == "summer" and t["academic_year"] == last_year)]
s["terms"].append({"academic_year": last_year, "term": "summer", "term_ar": "الصيفي", "status": "in_progress", "courses": []})
d.students()["test-summer"] = s
p = build_graduation_plan("test-summer", 5, True)
first_main = next(t for t in p["terms"] if t["term"] != "summer")
check("during a summer: the next fall is main semester done + 1", first_main["main_semester"] == done + 1,
      (done, first_main["main_semester"]))
check("during a summer: no main semester counted for it", p["current_main_semester"] == done, p["current_main_semester"])

# Every course passed but a GPA under 2.00: improve courses until 2.00 (articles 26 and 30), not "you graduate".
allc = d.courses()
taken = [c for c in allc.values() if c["type"] != "elective"] + [
    allc[code] for pool in d.program()["elective_pools"] for code in pool["courses"][:pool["choose"]]]
low = copy.deepcopy(d.get_student(EXC))
low["student_id"] = "test-lowgpa"
low["terms"] = [
    {"academic_year": "2029-2030", "term": "spring", "status": "published",
     "courses": [{"code": c["code"], "name_ar": c["name_ar"], "credits": c["credits"], "attempt": 1,
                  "grade": "C-" if c.get("graded", True) else "P"} for c in taken]},
    {"academic_year": "2030-2031", "term": "fall", "status": "in_progress", "courses": []}]
low["academic_status"].update({"cumulative_gpa": 1.7, "main_semesters_completed": 10, "consecutive_warning_semesters": 1,
                               "earned_hours": sum(c["credits"] for c in taken)})
d.students()["test-lowgpa"] = low
p = build_graduation_plan("test-lowgpa", 5, True)
imp = p.get("improvement") or {}
check("GPA under 2.00 with nothing left: not 'you graduate'", p.get("reason_code") == "gpa_below_2" and p["terms"], p.get("explanation"))
check("improvement plan reaches 2.00 with a B", imp.get("gpa_after", 0) >= 2.0, imp)
check("improvement plan only retakes passed courses, flagged as improvement",
      all(c["flag"] == "improvement" and c["code"] in imp["courses"] for t in p["terms"] for c in t["courses"]))
mains = [t for t in p["terms"] if t["term"] != "summer"]
check("improvement terms keep the 12-hour minimum rule", all(t["credits"] >= 12 or t.get("warning") for t in mains[:-1])
      and (mains[-1]["credits"] >= 12 or mains[-1].get("below_minimum_paper")), [(t["en"], t["credits"]) for t in mains])
del d.students()["test-summer"], d.students()["test-lowgpa"]

# Rules confirmed on 2026-10-17 (found by the stress test, ai/scripts/stress_plan.py).
def near_end(sid: str, left: set, current: list[str], term: str, main_done: int, grade: str = "B", streak: int = 0,
             extra: list[dict] = ()) -> str:
    """A student who passed everything but `left` (and the current courses), in `term` of 2026-2027."""
    s = copy.deepcopy(d.get_student(EXC))
    s["student_id"] = sid
    done = [c for c in allc.values() if c["type"] != "elective" and c["code"] not in left and c["code"] not in current]
    done += [allc[code] for pool in d.program()["elective_pools"] for code in pool["courses"][:pool["choose"]]]
    s["terms"] = [
        {"academic_year": "2025-2026", "term": "spring", "status": "published",
         "courses": [{"code": c["code"], "name_ar": c["name_ar"], "credits": c["credits"], "attempt": 1,
                      "grade": grade if c.get("graded", True) else "P"} for c in done] + list(extra)},
        {"academic_year": "2026-2027", "term": term, "status": "in_progress",
         "courses": [{"code": c, "name_ar": allc[c]["name_ar"], "credits": allc[c]["credits"], "attempt": 1} for c in current]}]
    s["academic_status"].update({"cumulative_gpa": None, "main_semesters_completed": main_done,
                                 "consecutive_warning_semesters": streak})
    from tools.rules import gpa_calculator  # noqa: E402
    d.students()[sid] = s
    s["academic_status"]["cumulative_gpa"] = gpa_calculator(sid)["cumulative_gpa"]
    return sid


# Failed one spring-only course; nothing else left after this summer: the college opens it in the fall (a graduation
# request), so 5 years is possible and graduation is that fall (not two empty semesters and a summer).
sid = near_end("test-one-spring", {"CSE 452"}, ["ARI 371"], "summer", 8,
               extra=[{"code": "CSE 452", "name_ar": allc["CSE 452"]["name_ar"], "credits": 3, "attempt": 1, "grade": "F"}])
p = build_graduation_plan(sid, 5, True)
flags = [(t["term"], c["flag"]) for t in p["terms"] for c in t["courses"]]
check("one spring course left after semester 8: 5 years possible, graduates that fall by request",
      p["status"] == "feasible" and flags == [("fall", "graduation_request")], (p["status"], flags))
check("... and 4.5 years too (a longer target is never harder)", build_graduation_plan(sid, 4.5, True)["status"] == "feasible")

# Two spring courses left after a spring term, no summer: the fall cannot stay empty, so the college opens one.
sid = near_end("test-two-spring", {"CSE 451", "CSE 452"}, ["ENG 312"], "spring", 11)
p = build_graduation_plan(sid, 5, False)
rows = [(t["term"], [c["flag"] for c in t["courses"]]) for t in p["terms"] if t["courses"]]
check("two spring courses left, no summer: a plan (not 'no plan'), the fall opened by request",
      p["graduation_term"] is not None and rows and rows[0] == ("fall", ["open_request"]), rows)

# The summer after the last semester counts: only the third training left in spring of semester 10.
sid = near_end("test-summer-counts", {"ARI 371"}, ["CSE 452"], "spring", 9)
p = build_graduation_plan(sid, 5, False)
check("graduating in the summer of year 5 is within 5 years", p["status"] == "feasible" and p["graduation_term"]["en"].startswith("Summer"),
      (p["status"], p["graduation_term"]))

# The highest term GPA the what-if offers can be entered.
p = build_graduation_plan(PROB, 5, True, failed_courses=[d.current_courses(d.get_student(PROB))[0]["code"]], expected_term_gpa=4.0)
if p.get("max_term_gpa") is not None:
    again = build_graduation_plan(PROB, 5, True, failed_courses=[d.current_courses(d.get_student(PROB))[0]["code"]],
                                  expected_term_gpa=p["max_term_gpa"])
    check("what-if: the highest term GPA shown is accepted", again.get("found"), again.get("error"))

# GPA under 2.00: the plan says graduation needs 2.00, when dismissal comes, and the GPA that gets back.
sid = near_end("test-under-2", set(c for c in allc if (allc[c]["planned_semester"] or 9) > 6), ["ECE 332"], "fall", 6,
               grade="D+", streak=1)
p = build_graduation_plan(sid, 5, True)
w = p.get("gpa_warning") or {}
check("under 2.00: warning with 2.00 for graduation and one semester left before dismissal",
      w.get("semesters_left") == 1 and "2.00" in w.get("ar", "") and "هتتفصل" in w.get("ar", ""), w)

# W is not a pass and not an attempt; DN counts in the GPA as 0 and is not a pass.
s = d.get_student(sid)
s["terms"][0]["courses"] += [{"code": "ECE 332", "name_ar": "x", "credits": 3, "attempt": 1, "grade": "W"}]
check("a withdrawal does not pass the course", not d.passed(d.best_attempts(s).get("ECE 332")))
s["terms"][0]["courses"][0]["grade"] = "DN"
code0 = s["terms"][0]["courses"][0]["code"]
check("a deprivation (DN) is not a pass", not d.passed(d.best_attempts(s)[code0]))
for k in ("test-one-spring", "test-two-spring", "test-summer-counts", "test-under-2"):
    del d.students()[k]

# Options table
o = plan_options(NEW)
check("options table 3 targets", [r["target_years"] for r in o["options"]] == [4, 4.5, 5], o)

print(f"\n{len(failures)} failure(s)")
for f in failures:
    print(" -", f)
sys.exit(1 if failures else 0)
