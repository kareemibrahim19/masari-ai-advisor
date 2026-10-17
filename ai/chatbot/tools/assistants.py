"""Teaching assistant (معيد) tools: the recommendations tab and the chat show the same thing.

Data: ai/data/teaching_assistants.json (simulated). A course has more than one teaching assistant only when its
section is taught by a different one in each of the two periods open on the system, which is rare (first and
second year mostly). Only those courses are "recommendations": the student sees each assistant's age, the year
they were appointed, and whether this is their first time teaching the course or the how-many-th. Masari does not
rank them or say which one is better; the student chooses.
"""

from . import _data as d


def _people() -> dict[str, dict]:
    return {t["id"]: t for t in d.teaching_assistant_data()["teaching_assistants"]}


def _by_course() -> dict[str, list[dict]]:
    return {c["course_code"]: c["assistants"] for c in d.teaching_assistant_data()["course_assistants"]}


def _view(code: str, rows: list[dict]) -> dict:
    people = _people()
    c = d.courses().get(code, {})
    return {"code": code, "name_ar": c.get("name_ar", code), "name_en": c.get("name_en") or c.get("name_ar", code),
            "assistants": [{"id": r["ta_id"], "name_ar": people[r["ta_id"]]["name_ar"],
                            "name_en": people[r["ta_id"]]["name_en"], "age": people[r["ta_id"]]["age"],
                            "appointed_year": people[r["ta_id"]]["appointed_year"], "period": r["period"],
                            "times_taught": r["times_taught"], "first_time": r["times_taught"] == 1}
                           for r in sorted(rows, key=lambda r: r["period"])]}


def recommendations_for(student_id: str) -> dict:
    """The student's registered courses (this term) that have more than one teaching assistant."""
    s = d.get_student(student_id)
    if not s:
        return d.not_found("الطالب", student_id)
    by_course = _by_course()
    codes = [c["code"] for c in d.current_courses(s)]
    out = [_view(code, by_course[code]) for code in codes if len(by_course.get(code, [])) > 1]
    if not out:
        return {"found": True, "courses": [],
                "explanation": "لا يوجد توصيات لك: مفيش مادة من المسجلة معاك الترم ده ليها أكتر من معيد."}
    return {"found": True, "courses": out,
            "explanation": "المواد دي ليها أكتر من معيد. دي معلومات عن كل معيد، والاختيار ليك (مساري مش بيفضّل معيد على التاني)."}


def teaching_assistants(student_id: str | None = None, course_code: str | None = None) -> dict:
    """Chat tool: the teaching assistants of one course, or the student's courses that have more than one."""
    if course_code:
        c = d.find_course(course_code)
        if not c:
            return d.not_found("المادة", course_code)
        rows = _by_course().get(c["code"], [])
        if not rows:
            return {"found": True, "course": d.course_label(c["code"]), "assistants": [],
                    "explanation": "مفيش بيانات معيدين للمادة دي الترم ده."}
        return {"found": True, "course": d.course_label(c["code"]), **_view(c["code"], rows)}
    if not student_id:
        return {"found": False, "error": "محتاج كود المادة أو طالب مختار."}
    return recommendations_for(student_id)
