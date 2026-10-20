"""Instructor information from how students did with the instructor: the grading model and its one tool.

Data: ai/data/instructor_grades.json (simulated today): who teaches each course this term (`this_term`, one instructor
per course), and one record per (course, academic year) for the last 10 years with the instructor who taught it that
year: average and median total, pass rate, grades, coursework and final averages, whether extra points were added that
year (a possibility, never a rule), and the average total by the students' GPA band.

The model, for the instructor teaching a course this term:
  grade record      pooled over the years they taught it (weighted by students); the course's earlier years with
                    previous instructors are the comparison (the page's chart shows both)
  grade level       above average, average, or below average (pass rate under 75% or average under 68)
  expected total    what students in the student's GPA band got with this instructor (all students for a
                    first-year student who has no GPA yet)
  first time        an instructor teaching the course for the first time has no record of their own in it; the
                    course's average with previous instructors is given instead
  your record       courses the student took in a year this instructor taught them, with the grade
  priority advice   joined with how much the course matters for the graduation plan (tools/priorities.py)
The wording is neutral and academic: numbers from the record, no judgement of the instructor.
"""

import math

from . import _data as d

STYLE_AR = {"lenient": "متوسط درجات مرتفع", "balanced": "متوسط درجات معتدل", "strict": "متوسط درجات منخفض"}
STYLE_EN = {"lenient": "Above-average grades", "balanced": "Average grades", "strict": "Below-average grades"}
BAND_EN = {"under_2": "GPA under 2.00", "2_to_3": "GPA 2.00 to 3.00", "3_plus": "GPA 3.00 or higher"}
BAND_PHRASE_AR = {"under_2": "يقل معدلهم التراكمي عن 2.00", "2_to_3": "يتراوح معدلهم التراكمي بين 2.00 و3.00",
                  "3_plus": "يبلغ معدلهم التراكمي 3.00 فأكثر"}
BAND_AR = {"under_2": "أقل من 2.00", "2_to_3": "من 2.00 لـ 3.00", "3_plus": "3.00 فأكتر"}


# ---------------------------------------------------------------- data

def _people() -> dict[str, dict]:
    return {i["id"]: i for i in d.instructor_data()["instructors"]}


def _records(instructor_id: str, course_code: str) -> list[dict]:
    return sorted((r for r in d.instructor_grades()["records"]
                   if r["instructor_id"] == instructor_id and r["course_code"] == course_code),
                  key=lambda r: r["academic_year"])


def _teaching_now(course_code: str) -> list[str]:
    """Who teaches the course this term (instructor_grades.json this_term), usually one instructor."""
    return d.instructor_grades().get("this_term", {}).get("teaching", {}).get(course_code, [])


def _history(course_code: str) -> list[dict]:
    """Every year of the course with every instructor who taught it (for the chart), oldest first."""
    people = _people()
    return [{"academic_year": r["academic_year"], "instructor_id": r["instructor_id"],
             "name_ar": people[r["instructor_id"]]["name_ar"], "name_en": people[r["instructor_id"]]["name_en"],
             "mean": r["mean"], "pass_rate": r["pass_rate"], "students": r["students"]}
            for r in sorted((r for r in d.instructor_grades()["records"] if r["course_code"] == course_code),
                            key=lambda r: (r["academic_year"], r["instructor_id"]))]


def _band(student: dict | None) -> str | None:
    gpa = (student or {}).get("academic_status", {}).get("cumulative_gpa")
    if gpa is None:
        return None
    return "under_2" if gpa < 2 else "2_to_3" if gpa < 3 else "3_plus"


# ---------------------------------------------------------------- the grading model

def _pooled(rs: list[dict]) -> dict:
    n = sum(r["students"] for r in rs)
    avg = lambda k, places=1: round(sum(r[k] * r["students"] for r in rs) / n, places)  # noqa: E731
    a_count = sum(r["grades"].get(g, 0) for r in rs for g in ("A+", "A", "A-"))
    bands = {}
    for b in BAND_AR:
        got = [(r["by_gpa_band"][b], r["students"]) for r in rs if b in r["by_gpa_band"]]
        if got:
            bands[b] = round(sum(v * w for v, w in got) / sum(w for _, w in got), 1)
    return {"bonus_years": len({r["academic_year"] for r in rs if r.get("bonus_added")}),
            "years": len({r["academic_year"] for r in rs}), "students": n, "mean": avg("mean"), "pass_rate": avg("pass_rate", 3), "a_rate": round(a_count / n, 3),
            "coursework_avg_pct": avg("coursework_avg_pct"), "final_avg_pct": avg("final_avg_pct"),
            "by_gpa_band": bands}


def _style(p: dict) -> str:
    if p["pass_rate"] < 0.75 or p["mean"] < 68:
        return "strict"
    if p["mean"] >= 80:
        return "lenient"
    return "balanced"


def coursework(p: dict) -> tuple[str, str]:
    """The coursework average in marks, out of the course's coursework marks (e.g. 25 of 30)."""
    if not p.get("coursework_max"):
        return (f"متوسط أعمال السنة {p['coursework_avg_pct']:.0f}% من درجتها", f"Average coursework {p['coursework_avg_pct']:.0f}% of its marks")
    return (f"متوسط أعمال السنة {p['coursework_avg']:.0f} من {p['coursework_max']} درجة (درجات أعمال السنة من المجموع)",
            f"Average coursework {p['coursework_avg']:.0f} of {p['coursework_max']} marks (the coursework part of the total)")


def _reasons(p: dict, band: str | None, expected: float) -> list[tuple[str, str]]:
    """(Arabic, English) facts from the grade record, in neutral academic wording."""
    # The average itself, and how it compares with the course, are on the chart and the "average" tile.
    out = [(f"نسبة النجاح {p['pass_rate'] * 100:.0f}%، ونسبة الحاصلين على تقدير A {p['a_rate'] * 100:.0f}%",
            f"Pass rate {p['pass_rate'] * 100:.0f}%; {p['a_rate'] * 100:.0f}% received an A"),
           coursework(p)]
    if p["bonus_years"]:
        out.append((f"سبق أن أُضيفت درجات إضافية (بونص) في {p['bonus_years']} من {p['years']} سنوات درّس فيها المقرر، "
                    "وقد يتكرر ذلك أو لا يتكرر",
                    f"Extra points were added in {p['bonus_years']} of the {p['years']} years they taught it; "
                    "this may or may not happen again"))
    if band:
        out.append((f"متوسط درجات الطلاب الذين {BAND_PHRASE_AR[band]} (مثل معدلك) مع هذا المحاضر: {expected:.0f} من 100",
                    f"Average with this instructor for students in your GPA band ({BAND_EN[band]}, like yours): {expected:.0f}/100"))
    return out


def _taught_you(student: dict | None, instructor_id: str) -> list[dict]:
    """The student's graded courses taken in a year this instructor taught them (from the course's yearly record)."""
    if not student:
        return []
    teacher = {(r["course_code"], r["academic_year"]): r["instructor_id"] for r in d.instructor_grades()["records"]}
    return [{"course_code": c["code"], "grade": c["grade"]}
            for t in student["terms"] if t["status"] == "published"
            for c in t["courses"] if c.get("grade") and teacher.get((c["code"], t["academic_year"])) == instructor_id]


def _took(h: dict) -> tuple[str, str]:
    """A course the student already took with this instructor, named (not coded) so the line reads plainly."""
    c = d.find_course(h["course_code"]) or {}
    ar = c.get("name_ar") or h["course_code"]
    en = c.get("name_en") or ar
    return (f"سبق لك دراسة {ar} مع هذا المحاضر وحصلت على تقدير {h['grade']}",
            f"You took {en} with this instructor and received {h['grade']}")


def course_ranking(course_code: str, student_id: str | None = None) -> dict:
    """This term's instructor of a course with their grade record for the student, and the course's 10-year history."""
    c = d.find_course(course_code)
    if not c:
        return d.not_found("المادة", course_code)
    student = d.get_student(student_id) if student_id else None
    band = _band(student)
    history = _history(c["code"])
    base = {"found": True, "course": d.course_label(c["code"]), "code": c["code"], "name_ar": c["name_ar"],
            "name_en": c.get("name_en") or c["name_ar"], "gpa_band": band, "history": history}
    now = _teaching_now(c["code"])
    if not now:
        return {**base, "course_mean": None, "instructors": [],
                "explanation": "لا يتوفر محاضر مسجل لهذا المقرر في الفصل الحالي."}
    iid = now[0]
    ins = _people()[iid]
    rs = _records(iid, c["code"])
    before = [r for r in d.instructor_grades()["records"] if r["course_code"] == c["code"] and r["instructor_id"] != iid]
    previous_mean = (round(sum(r["mean"] * r["students"] for r in before) / sum(r["students"] for r in before), 1)
                     if before else None)
    mine = [_took(h) for h in _taught_you(student, iid)]
    entry = {"instructor_id": iid, "name_ar": ins["name_ar"], "name_en": ins["name_en"], "first_time": not rs,
             "only_instructor": bool(rs) and not before}
    if not rs:
        reasons = [("هذا الفصل هو أول فصل يدرّس فيه هذا المحاضر المقرر، لذلك لا يتوفر له سجل درجات فيه.",
                    "This is the instructor's first term teaching this course, so there is no grade record for it yet.")]
        if previous_mean is not None:
            reasons.append((f"متوسط درجات المقرر خلال 10 سنوات مع المحاضرين السابقين {previous_mean:.0f} من 100",
                            f"The course averaged {previous_mean:.0f}/100 over 10 years with previous instructors"))
        entry.update(style=None, style_ar=None, style_en=None, expected_total=None)
    else:
        p = _pooled(rs)
        a = c.get("assessment") or {}
        p["coursework_max"] = (a.get("coursework") or 0) + (a.get("practical") or 0)
        p["coursework_avg"] = round(p["coursework_avg_pct"] * p["coursework_max"] / 100, 1)
        expected = p["by_gpa_band"].get(band, p["mean"]) if band else p["mean"]
        reasons = _reasons(p, band, expected)
        if not before:
            reasons.insert(0, ("درّس هذا المحاضر المقرر طوال السنوات العشر الماضية، لذلك لا توجد مقارنة مع محاضرين سابقين.",
                               "This instructor taught the course for all of the last 10 years, so there is no "
                               "comparison with previous instructors."))
        style = _style(p)
        entry.update(style=style, style_ar=STYLE_AR[style], style_en=STYLE_EN[style], expected_total=expected,
                     **{k: v for k, v in p.items() if k != "by_gpa_band"})
    reasons += mine
    entry.update(reasons=[a for a, _ in reasons], reasons_en=[e for _, e in reasons])
    return {**base, "course_mean": previous_mean, "instructors": [entry]}


# ---------------------------------------------------------------- priority (the graduation plan)

def _dependents(code: str) -> set[str]:
    allc = d.courses()
    seen, frontier = set(), [code]
    while frontier:
        cur = frontier.pop()
        for x in allc.values():
            if cur in d.prereqs(x) and x["code"] not in seen:
                seen.add(x["code"])
                frontier.append(x["code"])
    return seen


def _chain(code: str, memo: dict | None = None) -> int:
    memo = {} if memo is None else memo
    if code not in memo:
        nxt = [x["code"] for x in d.courses().values() if code in d.prereqs(x)]
        memo[code] = 1 + max(_chain(n, memo) for n in nxt) if nxt else 0
    return memo[code]


def priority_level(code: str, delay: int | None, needs_request: bool) -> str:
    """Same scale as the website (frontend/src/lib/rules.ts coursePriority / priorityLevel)."""
    delay_terms = 2 if delay is None else delay
    points = 60 if delay_terms >= 2 else 45 if delay_terms == 1 else 20 if needs_request else 0
    unlocks = len(_dependents(code))
    points += round(25 * min(1.0, math.log2(1 + unlocks) / math.log2(21))) + min(15, 5 * _chain(code))
    return "high" if points >= 45 else "medium" if points >= 20 else "normal"


def advice(level: str, instructor: dict) -> tuple[str, str] | None:
    """What to do, given how much the course matters for graduation and the instructor's grade record."""
    low = instructor.get("style") == "strict"
    if level == "high" and low:
        return ("هذا المقرر ذو أولوية عالية في خطة تخرجك، ويُنصح بتسجيله هذا الفصل رغم انخفاض متوسط الدرجات فيه، "
                "لأن تأجيله يؤخر موعد التخرج.",
                "This course is high priority in your graduation plan; register it this term despite the lower average, "
                "as postponing it delays graduation.")
    if level == "high":
        return ("هذا المقرر ذو أولوية عالية في خطة تخرجك، ويُنصح بتسجيله هذا الفصل.",
                "This course is high priority in your graduation plan; register it this term.")
    if low:
        return ("متوسط الدرجات في هذا المقرر مع هذا المحاضر أقل من المعتاد، ويُنصح بتخصيص وقت كافٍ للمذاكرة.",
                "The average in this course with this instructor is lower than usual; plan enough study time for it.")
    return None


# ---------------------------------------------------------------- the tool and the page

def recommendations_for(student_id: str) -> dict:
    """The recommendations page: every course the student is registered in this term that has an instructor this
    term, each with its instructor(s) and 10-year history. Priority and advice are added by the website."""
    s = d.get_student(student_id)
    if not s:
        return d.not_found("الطالب", student_id)
    courses = [course_ranking(c["code"], student_id) for c in d.current_courses(s)]
    return {"found": True, "gpa_band": _band(s), "courses": [c for c in courses if c.get("instructors")]}


def recommend_instructor(student_id: str | None = None, course_code: str | None = None) -> dict:
    """Chat tool: the instructor of one course (or of every course the student is registered in), with how
    students did with them, with the course's priority in the student's graduation plan and what to do."""
    if not course_code and not student_id:
        return {"found": False, "error": "محتاج كود المادة أو طالب مختار."}
    if course_code:
        out = [course_ranking(course_code, student_id)]
        if not out[0].get("found"):
            return out[0]
    else:
        out = recommendations_for(student_id)["courses"]
    delays = {}
    if student_id and d.get_student(student_id):
        from . import priorities
        delays = priorities.graduation_delays(student_id)
    for c in out:
        if c.get("instructors") and delays.get("found") and c["code"] in delays.get("delays", {}):
            level = priority_level(c["code"], delays["delays"][c["code"]], delays["needs_request"].get(c["code"], False))
            c["priority"] = level
            for x in c["instructors"]:
                a = advice(level, x)
                if a:
                    x["advice"], x["advice_en"] = a
        c.pop("history", None)  # the chart data is for the page; the chat does not need it
    return {"found": True, "courses": out,
            "explanation": "المعلومات وفق درجات الطلاب مع المحاضر خلال آخر 10 سنوات، مع أولوية المقرر في خطة تخرجك."}
