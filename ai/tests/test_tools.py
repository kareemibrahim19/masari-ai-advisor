"""Checks for the Masari tools against the six mock students. Run from the repo root:
    .venv/Scripts/python.exe ai/tests/test_tools.py
No API key or network needed: the tools are plain Python over ai/data.
"""

import copy
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
check("limit probation=14 (as any GPA under 2.00)", r["max_credits"] == 14 and r["on_warning"], r)
check("limit new student=18 (first term, same as the website)", call_tool("credit_limit", {}, NEW)["max_credits"] == 18)
check("limit summer=6 hours", call_tool("credit_limit", {"term_type": "summer"}, EXC)["max_credits"] == 6)
# A copy of the retake student at 93 hours: 3 short of ARI 381's 96, inside the projects' 4-hour tolerance.
short = copy.deepcopy(d.students()[RETAKE])
short["student_id"] = "test-93"
short["academic_status"]["earned_hours"] = 93
d.students()["test-93"] = short
r = call_tool("registration_eligibility", {"course_code": "ARI 381", "term_type": "spring"}, "test-93")
del d.students()["test-93"]
check("ARI 381 within the 4-hour tolerance is paper registration (93 of 96)",
      next(c for c in r["checks"] if c["check"] == "min_credits")["ok"] and "ورقي" in r["explanation"] + str(r["checks"]), r["checks"])

# standing
r = call_tool("academic_standing", {}, PROB)
check("probation on warning", r["on_warning"] and r["terms_left_before_dismissal"] >= 1, r)
# One semester before article 25's dismissal limit: the council's last chance is shown.
near = copy.deepcopy(d.students()[PROB])
near["student_id"] = "test-near"
near["academic_status"]["consecutive_warning_semesters"] = d.rules()["dismissal_after_consecutive_low_semesters"] - 1
d.students()["test-near"] = near
r = call_tool("academic_standing", {}, "test-near")
del d.students()["test-near"]
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

# instructors: one tool, ranked by how students did with each instructor over 3 years
for gone in ("who_teaches", "teaching_assistants", "instructor_profile", "compare_instructors", "student_preferences",
             "avoid_instructor", "restore_instructor", "set_instructor_preferences"):
    check(f"{gone} is removed", all(t["name"] != gone for t in TOOLS))
MALAK, YOUSSEF, HANA = "833603614", "897948891", "883941655"
from tools import instructors as ins  # noqa: E402
from tools import _data as dd  # noqa: E402
r = ins.recommendations_for(MALAK)
check("every current course with an instructor this term is listed", [c["code"] for c in r["courses"]]
      == ["BAS 011", "BAS 021", "BAS 031", "BAS 041", "PDE 052", "UNR 061"], [c["code"] for c in r["courses"]])
check("one instructor per course this term", all(len(c["instructors"]) == 1 for c in r["courses"]))
check("no ranking between instructors", all("best" not in x and "rank" not in x for c in r["courses"] for x in c["instructors"]))
recs = dd.instructor_grades()["records"]
check("one instructor per course per year", len({(x["course_code"], x["academic_year"]) for x in recs}) == len(recs))
c = r["courses"][0]
x = c["instructors"][0]
check("a first-year student has no GPA band (all students' average)", r["gpa_band"] is None and x["expected_total"] == x["mean"])
years = sorted({h["academic_year"] for h in c["history"]})
check("10 years of course history for the chart", len(years) == 10 and years[0] == "2016-2017" and years[-1] == "2025-2026", years)
alone = [k for k, v in dd.instructor_grades()["this_term"]["teaching"].items()
         if {r_["instructor_id"] for r_ in recs if r_["course_code"] == k} == set(v)]
check("one instructor for all 10 years is rare", 0 < len(alone) <= 3, alone)
one = ins.course_ranking(alone[0])["instructors"][0]
check("the only instructor in 10 years says there is nothing to compare with", one["only_instructor"]
      and "طوال السنوات العشر" in one["reasons"][0], one["reasons"])
r = ins.recommendations_for(HANA)
first = next(c for c in r["courses"] if c["code"] == "CSE 221")["instructors"][0]
check("an instructor teaching the course for the first time has no record of their own",
      first["first_time"] and first["expected_total"] is None and "أول فصل" in first["reasons"][0], first)
r = ins.recommendations_for(YOUSSEF)
check("GPA under 2 uses that band", r["gpa_band"] == "under_2")
r = call_tool("recommend_instructor", {"course_code": "BAS 115"}, YOUSSEF)
c = r["courses"][0]
check("chat tool adds the course priority", c.get("priority") == "high", c.get("priority"))
check("high priority: register it this term", "يُنصح بتسجيله هذا الفصل" in c["instructors"][0].get("advice", ""), c["instructors"])
check("chat result leaves out the chart data", "history" not in c)
mine = [t for c in ins.recommendations_for(YOUSSEF)["courses"] for t in c["instructors"][0]["reasons"] if "سبق لك دراسة" in t]
check("the student's own past grade is found from the year they took the course", mine, mine)
x = next(i for c in ins.recommendations_for(MALAK)["courses"] for i in c["instructors"] if not i["first_time"])
check("no attendance points (they differ between instructors)",
      "attendance_bonus" not in x and "curve_points" not in x and not any("الحضور" in t for t in x["reasons"]), x)
check("coursework shown in marks out of the course's coursework marks",
      x["coursework_max"] == 30 and 0 < x["coursework_avg"] <= 30 and any("من 30 درجة" in t for t in x["reasons"]), x)
check("a bonus is told as how often it happened, never as a rule",
      all("قد يتكرر ذلك أو لا يتكرر" in t for c in ins.recommendations_for(MALAK)["courses"] for i in c["instructors"]
          for t in i["reasons"] if "بونص" in t))
check("advice: high priority with a lower average", "رغم انخفاض متوسط الدرجات" in ins.advice("high", {"style": "strict"})[0])
check("recommend_instructor unknown course", call_tool("recommend_instructor", {"course_code": "XXX 999"})["found"] is False)

# find_courses / improvement_candidates
r = call_tool("find_courses", {"query": "الذكاء الاصطناعي"})
check("find_courses puts the closest name first", r["found"] and r["matches"][0]["code"] == "CSE 151", r)
check("find_courses nothing", call_tool("find_courses", {"query": "zzzzqq"})["found"] is False)
r = call_tool("improvement_candidates", {}, RETAKE)
check("improvement candidates ranked by gain", r["found"] and r["candidates"]
      and r["candidates"] == sorted(r["candidates"], key=lambda x: -x["gain_if_A"]), r)
check("improvement candidates never offer an A student's course", all(c["current_grade"] not in ("A", "A+", "A-") for c in r["candidates"]))
check("improvement: new student has none", call_tool("improvement_candidates", {}, NEW)["candidates"] == [])

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
check("paper: on warning 14 on the system, 15 on paper", r["cases"][0]["applies"] is True and r["system_max_credits"] == 14, r)
r = call_tool("paper_registration", {"reason": "more_hours"}, EXC)
check("paper: GPA above 2 does not need paper for more hours", r["cases"][0]["applies"] is False, r)
r = call_tool("paper_registration", {"reason": "system_closed"}, EXC)
check("paper: system closed always goes on paper, and says to go to the program administration",
      r["paper_needed"] and "إدارة البرنامج" in r["cases"][0]["explanation"] and r["how_ar"], r)
r = call_tool("paper_registration", {"reason": "more_hours"}, EXC)
check("paper: no 'go to the program administration' when paper does not apply", "إدارة البرنامج" not in r["explanation"] and not r["how_ar"], r)
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
check("paper: 8 hours left in the last term -> paper below 12, go to the program administration",
      r["cases"][0]["applies"] and r["paper_needed"] and "إدارة البرنامج" in r["cases"][0]["explanation"], r)
del d.students()["test-low"], d.students()["test-last"]

# Article 25's limit of main semesters in a row under 2.00 reached: said plainly (not "0 more semesters").
gone = copy.deepcopy(d.students()[PROB])
gone["student_id"] = "test-gone"
gone["academic_status"]["consecutive_warning_semesters"] = d.rules()["dismissal_after_consecutive_low_semesters"]
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
