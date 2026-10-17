"""Instructor tool: who teaches a course, section by section.

Masari does not rank or recommend instructors (the team dropped it: comparing doctors is biased and not ethical).
Only the plain fact of who teaches which section is kept; the survey profiles in ai/data/instructors.json are not
shown. Recommendations are about teaching assistants now (see assistants.py).
"""

from . import _data as d


def who_teaches(course_code: str, term: str | None = None) -> dict:
    """Instructors and sections of a course (optionally only those offered in fall / spring)."""
    c = d.find_course(course_code)
    if not c:
        return d.not_found("المادة", course_code)
    people = {i["id"]: i for i in d.instructor_data()["instructors"]}
    rows = [o for o in d.instructor_data()["offerings"] if o["course_code"] == c["code"]]
    if term in ("fall", "spring"):
        rows = [o for o in rows if o["offered_term"] in (term, "both")]
    if not rows:
        return {"found": True, "course": d.course_label(c["code"]), "sections": [],
                "explanation": "مفيش دكاترة مسجلين للمادة دي (ممكن تكون تدريب أو مشروع بإشراف)."}
    sections = [{"section": o["section"], "offered_term": o["offered_term"], "instructor_id": o["instructor_id"],
                 "name_ar": people[o["instructor_id"]]["name_ar"], "name_en": people[o["instructor_id"]]["name_en"]}
                for o in rows]
    return {"found": True, "course": d.course_label(c["code"]), "sections": sections,
            "explanation": f"المادة {d.course_label(c['code'])} بتدرّسها {len(rows)} شعب."}
