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
check("limit summer=6 hours", call_tool("credit_limit", {"term_type": "summer"}, EXC)["max_credits"] == 6)
r = call_tool("registration_eligibility", {"course_code": "ARI 381", "term_type": "spring"}, RETAKE)
check("ARI 381 within the 4-hour tolerance is paper registration (93 of 96)",
      next(c for c in r["checks"] if c["check"] == "min_credits")["ok"] and "ورقي" in r["explanation"] + str(r["checks"]), r["checks"])

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
check("no ambiguous level field", "level" not in call_tool("academic_level", {}, NEW))
check("study level by year: first year = 0", call_tool("academic_level", {}, NEW)["study_level"] == "0")
check("study level by year: semester 5 = 200", call_tool("academic_level", {}, EXC)["study_level"] == "200")
check("study level by year: semester 9 = 400", call_tool("academic_level", {}, NEAR)["study_level"] == "400")
check("level names: 0 Freshman, 400 Senior", call_tool("academic_level", {}, NEW)["level_name"] == "Freshman"
      and call_tool("academic_level", {}, NEAR)["level_name"] == "Senior")
check("level name: 300 is Junior", call_tool("academic_level", {}, RETAKE)["level_name"] == "Junior")

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

# actions the chat applies to the pages
r = call_tool("avoid_instructor", {"instructor": "سارة"})
check("avoid_instructor returns an action", r["found"] and r["action"]["type"] == "avoid_instructor"
      and r["action"]["instructor_id"] == "i1" and r["action"]["key"] == "i1", r)
r = call_tool("avoid_instructor", {"instructor": "سارة", "course_code": "ECE 321"})
check("avoid in one course keys by course", r["action"]["key"] == "i1:ECE 321", r)
check("avoid unknown instructor", call_tool("avoid_instructor", {"instructor": "مجهول"})["found"] is False)
check("restore_instructor returns an action", call_tool("restore_instructor", {"instructor": "سارة"})["action"]["type"] == "restore_instructor")
r = call_tool("set_instructor_preferences", {"pace": 20, "practical": 150})
check("preferences are clamped to 0-100", r["action"]["preferences"] == {"pace": 20, "practical": 100}, r)
check("preferences need a value", call_tool("set_instructor_preferences", {})["found"] is False)
r = call_tool("recommend_instructor", {"course_code": "ECE 321"}, NEW, {"excluded": ["i1"]})
check("excluded instructor leaves the ranking", all(x["instructor_id"] != "i1" for x in r["ranking"])
      and [x["instructor_id"] for x in r["excluded"]] == ["i1"], r)
r = call_tool("recommend_instructor", {"course_code": "CSE 315"}, NEW, {"excluded": ["i1:ECE 321"]})
check("a per-course exclusion does not touch other courses", len(r["ranking"]) == 2, r)
r = call_tool("recommend_instructor", {"course_code": "ECE 321"}, NEW, {"excluded": ["i1", "i2", "i3"]})
check("everyone excluded -> empty ranking with a message", r["ranking"] == [] and len(r["excluded"]) == 3, r)
r = call_tool("recommend_instructor", {"course_code": "ECE 321"}, NEW, {"preferences": {"pace": 85, "workload": 85, "practical": 85}})
check("session preferences are used by the chat tool", r["basis"] == "surveys_and_preferences" and r["ranking"][0]["instructor_id"] == "i2", r)

# the schedule on the courses tab (the website sends what the page holds)
PAGE = {"eligible_courses": [{"code": "BAS 011", "credits": 3}, {"code": "BAS 021", "credits": 3},
                             {"code": "UNR 061", "credits": 2}, {"code": "CSE 151", "credits": 3},
                             {"code": "BAS 031", "credits": 3}, {"code": "BAS 041", "credits": 3}],
        "selected_courses": ["BAS 011", "BAS 021"], "max_load": 12}
r = call_tool("add_course_to_schedule", {"course_code": "CSE 151"}, NEW, PAGE)
check("add a course the page offers", r["added"] and r["action"] == {"type": "select_course", "course_code": "CSE 151"}, r)
r = call_tool("add_course_to_schedule", {"course_code": "مقدمة للذكاء الاصطناعي"}, NEW, PAGE)
check("add by name", r.get("added") is True or r.get("found") is False, r)
r = call_tool("add_course_to_schedule", {"course_code": "BAS 011"}, NEW, PAGE)
check("already in the schedule", r["added"] is False and "action" not in r, r)
r = call_tool("add_course_to_schedule", {"course_code": "BAS 115"}, NEW, PAGE)
check("not eligible: refused with the prerequisite reason", r["added"] is False and "BAS 012" in r["explanation"], r)
full = {**PAGE, "selected_courses": ["BAS 011", "BAS 021", "UNR 061", "CSE 151"]}
r = call_tool("add_course_to_schedule", {"course_code": "BAS 031"}, NEW, full)
check("over the load limit: refused", r["added"] is False and "الحد الأقصى" in r["explanation"], r)
r = call_tool("remove_course_from_schedule", {"course_code": "BAS 021"}, NEW, PAGE)
check("remove a chosen course", r["removed"] and r["action"]["type"] == "unselect_course", r)
check("remove one that is not chosen", call_tool("remove_course_from_schedule", {"course_code": "CSE 151"}, NEW, PAGE)["removed"] is False)
r = call_tool("build_schedule", {"hours": 9}, NEW, PAGE)
check("build a 9-hour schedule: exactly 9 hours, highest priorities",
      r["built"] and r["hours"] == 9 and r["courses"] == ["BAS 011", "BAS 021", "CSE 151"], r)
r = call_tool("build_schedule", {"hours": 11}, NEW, PAGE)
check("build 11 hours: 3+3+3+2", r["built"] and r["hours"] == 11 and "UNR 061" in r["courses"], r)
check("build over the limit refused", call_tool("build_schedule", {"hours": 30}, NEW, PAGE)["built"] is False)
check("no page open -> clear error", call_tool("add_course_to_schedule", {"course_code": "CSE 151"}, NEW)["found"] is False)

# graduation plan: the chat gets the same answer as the plan page
from tools.planner import build_graduation_plan  # noqa: E402
r = call_tool("graduation_plan", {"target_years": 4}, EXC)
page = build_graduation_plan(EXC, 4, True)
check("chat plan = page plan (feasible, graduation)", r["possible"] == page["feasible"]
      and r["graduation"] == page["graduation_term"]["ar"], (r.get("possible"), r.get("graduation")))
check("chat plan says why not, by course name", not r["possible"] and "مشروع (1)" in r["why_not"] and "مشروع (3)" in r["why_not"]
      and "ARI" not in r["why_not"], r.get("why_not"))
r = call_tool("registration_eligibility", {"course_code": "ARI 481", "term_type": "fall"}, RETAKE)
check("project 2 needs project 1 first", not r["eligible"] and any("ARI 381" in b for b in r["blockers"]), r.get("blockers"))
r = call_tool("graduation_plan", {}, EXC, {"plan_target": 5, "plan_summer": False})
check("chat plan defaults to the page's choice", r["target_years"] == 5 and r["allow_summer"] is False and r["possible"], r)
r = call_tool("graduation_plan", {}, NEW)
check("chat plan table has the three targets", [o["target_years"] for o in r["all_targets"]] == [4, 4.5, 5], r)

# contact advisor: escalation email for cases the chatbot cannot settle
r = call_tool("contact_advisor", {"case": "course_full", "course_code": "ari 381", "details": "اكتمل العدد.", "confirmed": True}, EXC)
s = d.get_student(EXC)
check("advisor email has the student's name, id and course",
      s["personal"]["name_ar"] in r["email"]["body"] and EXC in r["email"]["subject"]
      and "ARI 381" in r["email"]["body"] and "اكتمل العدد." in r["email"]["body"], r["email"])
check("advisor email goes to the student's advisor", r["advisor_known"] and r["email"]["to"] == d.advisor_of(EXC)["email"]
      and d.advisor_of(EXC)["name_ar"] in r["email"]["body"], r)
check("advisor email is an action for the website", r["action"]["type"] == "advisor_email", r)
check("every mock student has an advisor", all(d.advisor_of(sid) for sid in d.students()))
r = call_tool("my_advisor", {}, PROB)
check("my advisor: name, email, office hours", r["found"] and r["advisor"]["email"].endswith(".example")
      and r["advisor"]["office_hours_ar"], r)
r = call_tool("contact_advisor", {"case": "registration_missed", "language": "en", "confirmed": True}, None)
check("advisor email without a student uses placeholders, English",
      "[Your name]" in r["email"]["body"] and r["email"]["subject"].startswith("Request for late"), r["email"])
check("unknown advisor case falls back to other", call_tool("contact_advisor", {"case": "xyz"})["case"] == "other")

r = call_tool("contact_advisor", {"case": "course_full", "course_code": "CSE 351"}, EXC)
check("first call offers help and asks details, no email", r.get("try_first") and r["ask_ar"] and "email" not in r, r)
check("system_error case removed (a stuck system is normal at registration)",
      call_tool("contact_advisor", {"case": "system_error", "confirmed": True}, EXC)["case"] == "other")

# load exception: asks why and how many hours before writing the email
r = call_tool("contact_advisor", {"case": "load_exception"}, NEAR)
check("load exception asks the reason and hours first", r.get("needs_info") and "email" not in r
      and set(r["missing"]) == {"reason", "requested_hours"}, r)
r = call_tool("contact_advisor", {"case": "load_exception", "reason": "graduation", "requested_hours": 24, "confirmed": True}, NEAR)
check("load exception email has hours, limit, reason and hours left",
      "الساعات المطلوبة: 24" in r["email"]["body"] and "إلى 21" in r["email"]["body"]
      and "الساعات المتبقية للتخرج: 26" in r["email"]["body"], r.get("email"))
r = call_tool("contact_advisor", {"case": "other_department_course"}, EXC)
check("other department case asks for the course", r.get("missing") == ["course_code"], r)
r = call_tool("contact_advisor", {"case": "other_department_course", "course_code": "CSE 351", "confirmed": True}, EXC)
check("other department email asks about an equivalent course", "قسم آخر" in r["email"]["body"]
      and "CSE 351" in r["email"]["body"], r.get("email"))

# advisor signal: spotting advisor cases in the student's words (helps the weaker fallback models)
from tools.advisor import advisor_signal  # noqa: E402
for q in ["اكتبلي الإيميل للمرشد", "عايز اكلم المرشد", "مين مرشدي؟", "ايميل المرشد بتاعي ايه", "send an email to my advisor"]:
    check(f"explicit advisor request: {q}", advisor_signal(q) == "explicit", advisor_signal(q))
for q in ["مادة CSE 351 العدد قفل", "نسيت اسجل المواد", "عايز ازود حد الساعات", "المادة مفتوحة في قسم تاني؟"]:
    check(f"likely advisor case: {q}", advisor_signal(q) == "likely", advisor_signal(q))
for q in ["اقدر اسجل كام ساعة؟", "معدلي كام؟", "مين بيدرس CSE 351؟", "السيستم معلق ومش عارف اسجل"]:
    check(f"not an advisor case: {q}", advisor_signal(q) is None, advisor_signal(q))

# paper registration: GPA below 2 (14 on the system, 15 on paper), system closed, last term below 12
import copy  # noqa: E402
r = call_tool("paper_registration", {"reason": "more_hours"}, PROB)
check("paper: on warning stays at 12, no paper option", r["cases"][0]["applies"] is False and r["system_max_credits"] == 12, r)
r = call_tool("paper_registration", {"reason": "more_hours"}, EXC)
check("paper: GPA above 2 does not need paper for more hours", r["cases"][0]["applies"] is False, r)
r = call_tool("paper_registration", {"reason": "system_closed"}, EXC)
check("paper: system closed always goes on paper, and says to go to student affairs",
      r["paper_needed"] and "شئون الطلاب" in r["cases"][0]["explanation"] and r["how_ar"], r)
r = call_tool("paper_registration", {"reason": "more_hours"}, PROB)
check("paper: no 'go to student affairs' when paper does not apply", "شئون الطلاب" not in r["explanation"] and not r["how_ar"], r)
check("paper: 26 hours left is not the last term", not call_tool("paper_registration", {"reason": "below_minimum"}, NEAR)["cases"][0]["applies"])

low = copy.deepcopy(d.students()[EXC])  # a GPA-below-2 student not yet on warning (first two terms)
low["student_id"] = "test-low"
low["academic_status"].update({"cumulative_gpa": 1.8, "main_semesters_completed": 1})
last = copy.deepcopy(d.students()[NEAR])  # 8 hours left: the last term
last["student_id"] = "test-last"
last["academic_status"]["earned_hours"] = last["academic_status"]["required_hours"] - 8
d.students().update({"test-low": low, "test-last": last})
r = call_tool("paper_registration", {"reason": "more_hours"}, "test-low")
check("paper: GPA 1.8 -> 14 on the system, 15 on paper with 5 courses of 3",
      r["system_max_credits"] == 14 and r["cases"][0]["applies"] and "15" in r["cases"][0]["explanation"], r)
check("paper: 14 requested fits the system", not call_tool("paper_registration", {"reason": "more_hours", "requested_hours": 14}, "test-low")["cases"][0]["applies"])
check("paper: 16 requested is too many", "مينفعش" in call_tool("paper_registration", {"reason": "more_hours", "requested_hours": 16}, "test-low")["cases"][0]["explanation"])
r = call_tool("paper_registration", {"reason": "below_minimum"}, "test-last")
check("paper: 8 hours left in the last term -> paper below 12, go to student affairs",
      r["cases"][0]["applies"] and r["paper_needed"] and "شئون الطلاب" in r["cases"][0]["explanation"], r)
del d.students()["test-low"], d.students()["test-last"]

# Three warning semesters in a row: dismissal reached is said plainly (not "0 more semesters").
gone = copy.deepcopy(d.students()[PROB])
gone["student_id"] = "test-gone"
gone["academic_status"]["consecutive_warning_semesters"] = 3
d.students()["test-gone"] = gone
r = call_tool("academic_standing", {}, "test-gone")
check("dismissal reached: says so, not '0 more semesters'",
      r.get("dismissal_reached") and "لحد الفصل" in r["explanation"] and "لـ 0" not in r["explanation"], r.get("explanation"))
check("dismissal reached: still mentions the council's last chance", "last_chance" in r, r)
del d.students()["test-gone"]

# project allowance: projects 1 and 2 up to 4 hours short on paper, project 3 up to 6
def _with_hours(base, sid, earned):
    s = copy.deepcopy(d.students()[base])
    s["student_id"] = sid
    s["academic_status"]["earned_hours"] = earned
    d.students()[sid] = s
    return sid

def _project(sid, code):
    return call_tool("paper_registration", {"reason": "project_allowance", "course_code": code}, sid)["cases"][0]["projects"][0]

check("project 1 (needs 96): 93 hours -> paper", _project(_with_hours(EXC, "t93", 93), "ARI 381")["status"] == "paper")
check("project 1: 92 hours (4 short) -> paper", _project(_with_hours(EXC, "t92", 92), "ARI 381")["status"] == "paper")
check("project 1: 91 hours (5 short) -> not yet", _project(_with_hours(EXC, "t91", 91), "ARI 381")["status"] == "not_yet")
check("project 1: 96 hours -> system", _project(_with_hours(EXC, "t96", 96), "ARI 381")["status"] == "system")
check("project 2 (needs 116): 112 -> paper, 111 -> not yet",
      _project(_with_hours(EXC, "t112", 112), "ARI 481")["status"] == "paper"
      and _project(_with_hours(EXC, "t111", 111), "ARI 481")["status"] == "not_yet")
check("project 3 (needs 130): 124 -> paper, 123 -> not yet",
      _project(_with_hours(EXC, "t124", 124), "ARI 482")["status"] == "paper"
      and _project(_with_hours(EXC, "t123", 123), "ARI 482")["status"] == "not_yet")
check("project allowance only for projects", _project(EXC, "CSE 351")["status"] == "not_project")
r = call_tool("registration_eligibility", {"course_code": "ARI 381"}, "t93")
check("eligibility mentions the project allowance", any("سماحية المشاريع" in c["detail"] for c in r["checks"]), r.get("checks"))
for sid in ("t93", "t92", "t91", "t96", "t112", "t111", "t124", "t123"):
    del d.students()[sid]

# registry: every tool callable, session student overrides the model's
check("tool names unique", len({t["name"] for t in TOOLS}) == len(TOOLS))
check("student id injected", call_tool("academic_level", {"student_id": "wrong"}, EXC)["found"])
check("unknown tool", call_tool("nope")["found"] is False)

print(f"\n{len(failures)} failure(s)")
for f in failures:
    print(" -", f)
sys.exit(1 if failures else 0)
