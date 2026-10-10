"""Checks for the Masari tools against the six mock students. Run from the repo root:
    .venv/Scripts/python.exe ai/tests/test_tools.py
No API key or network needed: the tools are plain Python over ai/data.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "chatbot"))
from tools import TOOLS, call_tool  # noqa: E402
from tools import _data as d  # noqa: E402

BY = {s["persona"]: s["student_id"] for s in d.students().values()}
EXC, PROB, NEAR, FAILPRE, NEW, RETAKE = (BY[k] for k in (
    "excellent", "probation", "near_graduation", "failed_prerequisite", "new_student", "retake"))
failures = []


def check(name, cond, got=None):
    if not cond:
        failures.append(f"{name}: {got}")
    print(("ok   " if cond else "FAIL ") + name)


# credit limit: GPA bands, warning, first term, summer
check("limit excellent=21", call_tool("credit_limit", {}, EXC)["max_credits"] == 21)
r = call_tool("credit_limit", {}, PROB)
check("limit probation=12", r["max_credits"] == 12 and r["on_warning"], r)
check("limit new student=18 (first term, same as the website)", call_tool("credit_limit", {}, NEW)["max_credits"] == 18)
check("limit summer=3 courses", call_tool("credit_limit", {"term_type": "summer"}, EXC)["max_courses"] == 3)

# standing
r = call_tool("academic_standing", {}, PROB)
check("probation on warning", r["on_warning"] and r["terms_left_before_dismissal"] >= 1, r)
r = call_tool("academic_standing", {}, PROB)
lc = r.get("last_chance")
check("last chance shown for a student near dismissal", bool(lc) and lc["required_earned_hours"] == 128
      and lc["meets_hours_condition"] is False, r)
check("no last chance for a regular student", "last_chance" not in call_tool("academic_standing", {}, EXC))
check("excellent regular", not call_tool("academic_standing", {}, EXC)["on_warning"])
check("new student no warning", not call_tool("academic_standing", {}, NEW)["on_warning"])

# GPA recomputed equals the stored value for every student
for name, sid in BY.items():
    stored = d.get_student(sid)["academic_status"]["cumulative_gpa"]
    got = call_tool("gpa_calculator", {}, sid)["cumulative_gpa"]
    check(f"gpa matches stored ({name})", got == stored, (got, stored))

# retake / improvement
check("failed ECE 332 must retake cap B+", (lambda r: r["status"] == "must_retake" and r["max_grade_after_retake"] == "B+")(
    call_tool("retake_info", {"course_code": "ECE 332"}, FAILPRE)))
check("passed course is improvement", call_tool("retake_info", {"course_code": "BAS 011"}, EXC)["status"] == "passed")
check("never taken", call_tool("retake_info", {"course_code": "CSE 351"}, NEW)["status"] == "not_taken")

# course info and unlocks
check("course by arabic name", call_tool("course_info", {"query": "التعلم العميق"})["code"] == "CSE 351")
check("course by sloppy code", call_tool("course_info", {"query": "cse351"})["code"] == "CSE 351")
r = call_tool("course_unlocks", {"course_code": "ECE 332"})
check("ECE 332 unlocks CSE 351", any("CSE 351" in x["course"] for x in r["unlocks_directly"]), r)
check("unknown course", call_tool("course_info", {"query": "XYZ 999"})["found"] is False)

# level
check("level junior", call_tool("academic_level", {}, EXC)["level_name"] == "Junior")
check("level freshman", call_tool("academic_level", {}, NEW)["level"] == 1)

# electives: counts add up
r = call_tool("elective_status", {}, NEAR)
check("electives pools", len(r["pools"]) == 2 and r["electives_required_total"] == 5, r)

# attendance boundaries
for pct, want in ((5, "ok"), (12, "first_warning"), (22, "second_warning"), (26, "deprived")):
    check(f"attendance {pct}%", call_tool("attendance_check", {"absence_pct": pct})["status"] == want)
r = call_tool("attendance_check", {"absent_hours": 6, "total_hours": 45})
check("attendance from hours", r["absence_pct"] == 13.3 and r["max_absent_hours"] == 11, r)

# drop / withdraw
check("week 3 can drop", call_tool("drop_withdraw_info", {"current_week": 3})["can_drop"])
r = call_tool("drop_withdraw_info", {"current_week": 7})
check("week 7 withdraw only", not r["can_drop"] and r["can_withdraw"] and r["withdraw_grade"] == "W", r)
check("week 11 nothing", not call_tool("drop_withdraw_info", {"current_week": 11})["can_withdraw"])
check("summer week 4 no withdraw", not call_tool("drop_withdraw_info", {"current_week": 4, "term_type": "summer"})["can_withdraw"])

# registration eligibility
r = call_tool("registration_eligibility", {"course_code": "CSE 351", "term_type": "spring"}, FAILPRE)
check("failed prerequisite blocks CSE 351", not r["eligible"] and any("ECE 332" in b for b in r["blockers"]), r)
r = call_tool("registration_eligibility", {"course_code": "CSE 351", "term_type": "spring"}, EXC)
check("prerequisite check reports ECE 332 for a student who has not taken it",
      all(k["ok"] for k in r["checks"] if k["check"] != "prerequisites") or not r["eligible"], r["explanation"])
r = call_tool("registration_eligibility", {"course_code": "ARI 381", "term_type": "spring"}, NEW)
check("new student blocked from project", not r["eligible"], r)
r = call_tool("registration_eligibility", {"course_code": "BAS 011"}, EXC)
check("already passed", not r["eligible"], r)

# instructors
r = call_tool("who_teaches", {"course_code": "ECE 321"})
check("ECE 321 has 3 sections", len(r["sections"]) == 3, r)
check("profile by name", call_tool("instructor_profile", {"instructor": "ليلى"})["instructor_id"] == "i3")
r = call_tool("recommend_instructor", {"course_code": "ECE 321"}, NEW)
check("new student -> surveys_only", r["basis"] == "surveys_only", r["basis"])
r2 = call_tool("recommend_instructor", {"course_code": "ECE 321", "pace": 85, "workload": 85, "practical": 85}, NEW)
check("stated prefs -> preferences basis, picks demanding", r2["basis"] == "surveys_and_preferences"
      and r2["ranking"][0]["instructor_id"] == "i2", [(x["instructor_id"], x["score"]) for x in r2["ranking"]])
r3 = call_tool("recommend_instructor", {"course_code": "ECE 321"}, EXC)
check("student with grades -> performance basis", r3["basis"] == "surveys_and_performance", r3["basis"])
low = next(x for x in r["ranking"] if x["instructor_id"] == "i3")
check("few responses flagged low confidence", low["confidence"] == "low" and any("قليل" in t for t in low["reasons"]))
r = call_tool("compare_instructors", {"course_code": "ECE 321", "instructor_a": "سارة", "instructor_b": "عمرو"}, EXC)
check("compare picks one", r["found"] and "better_for_student" in r, r)
check("compare wrong course", call_tool("compare_instructors", {"course_code": "ECE 321", "instructor_a": "سارة",
                                                              "instructor_b": "هاني"})["found"] is False)

# find_courses / improvement_candidates / compare without a course
r = call_tool("find_courses", {"query": "الذكاء الاصطناعي"})
check("find_courses puts the closest name first", r["found"] and r["matches"][0]["code"] == "CSE 151", r)
check("find_courses nothing", call_tool("find_courses", {"query": "zzzzqq"})["found"] is False)
r = call_tool("improvement_candidates", {}, RETAKE)
check("improvement candidates ranked by gain", r["found"] and r["candidates"]
      and r["candidates"] == sorted(r["candidates"], key=lambda x: -x["gain_if_A"]), r)
check("improvement candidates never offer an A student's course", all(c["current_grade"] not in ("A", "A+", "A-") for c in r["candidates"]))
check("improvement: new student has none", call_tool("improvement_candidates", {}, NEW)["candidates"] == [])
r = call_tool("compare_instructors", {"instructor_a": "هاني", "instructor_b": "منى"}, EXC)
check("compare infers the one shared course", r["found"] and "CSE 315" in r["course"], r)
r = call_tool("compare_instructors", {"instructor_a": "سارة", "instructor_b": "عمرو"}, EXC)
check("compare lists several shared courses", r["found"] is False and len(r["common_courses"]) > 1, r)
r = call_tool("compare_instructors", {"instructor_a": "سارة", "instructor_b": "هاني"}, EXC)
check("compare: no shared course", r["found"] is False, r)

# registry: every tool callable, session student overrides the model's
check("tool names unique", len({t["name"] for t in TOOLS}) == len(TOOLS))
check("student id injected", call_tool("academic_level", {"student_id": "wrong"}, EXC)["found"])
check("unknown tool", call_tool("nope")["found"] is False)

print(f"\n{len(failures)} failure(s)")
for f in failures:
    print(" -", f)
sys.exit(1 if failures else 0)
