"""Read the database back in the exact shape of the ai/data/*.json files.

The tools (ai/chatbot/tools/_data.py), students.py and the website all read that shape today, so they can move to
the database by calling these functions instead of reading the files, with nothing else changed:

    students_file(s)        == json.load("students.json")
    student_record(s, id)   == one entry of students.json["students"] (None if unknown)
    courses_file(s)         == json.load("courses.json")
    instructors_file(s)     == json.load("instructors.json")
    advisors_file(s)        == json.load("advisors.json")
    history_file(s)         == json.load("student_instructor_history.json")
    sections_file(s)        == json.load("sections.json")
    instructor_grades_file(s) == json.load("instructor_grades.json")

`s` is an open Session. tests/test_db.py checks that each one matches its file.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from db.models import (Advisor, Course, CourseResult, ElectivePool, ElectiveSlot, Instructor, InstructorCourseYear,
                       Meta, Offering, Program, SectionSeats, Student, StudentTerm)
from db.seed import SUMMARY_FIELDS


def _meta(s: Session, key: str, default=None):
    row = s.get(Meta, key)
    return row.value if row else default


def _with_note(s: Session, file: str, body: dict) -> dict:
    note = _meta(s, "notes", {}).get(file)
    return {"_note": note, **body} if note is not None else body


def _drop_none(d: dict) -> dict:
    return {k: v for k, v in d.items() if v is not None}


# ------------------------------------------------------------------------------------------------ students

_STUDENT_LOAD = (
    selectinload(Student.guardian), selectinload(Student.previous_qualification),
    selectinload(Student.academic_status),
    selectinload(Student.terms).selectinload(StudentTerm.results).selectinload(CourseResult.course),
)


def _student_dict(st: Student) -> dict:
    a = st.academic_status
    out = {
        "student_id": st.student_id,
        "persona": st.persona,
        "persona_note": st.persona_note,
        "personal": {
            "name_ar": st.name_ar, "name_en": st.name_en, "gender": st.gender,
            "birth_date": st.birth_date.isoformat() if st.birth_date else None,
            "birth_place": st.birth_place, "nationality": st.nationality,
            "national_id": st.national_id, "id_type": st.id_type,
        },
        "contact": {
            "governorate": st.governorate, "city": st.city, "address": st.address,
            "mobile": st.mobile, "university_email": st.university_email,
        },
    }
    if g := st.guardian:
        out["guardian"] = {"name": g.name, "relation": g.relation, "job": g.job, "mobile": g.mobile}
    if q := st.previous_qualification:
        out["previous_qualification"] = {
            "qualification": q.qualification, "year": q.year, "total": q.total, "max_total": q.max_total,
            "percentage": q.percentage, "round": q.round, "transferred_from": q.transferred_from,
        }
    out["enrollment"] = {"university": st.university, "faculty": st.faculty, "program": st.program,
                         "enrollment_year": st.enrollment_year}
    if a:
        out["academic_status"] = {
            "level": a.level, "name": a.level_name, "required_hours": a.required_hours,
            "earned_hours": a.earned_hours, "mandatory_hours": a.mandatory_hours,
            "elective_hours": a.elective_hours, "project_hours": a.project_hours,
            "trainings_passed": a.trainings_passed, "cumulative_gpa": a.cumulative_gpa,
            "main_semesters_completed": a.main_semesters_completed, "academic_standing": a.academic_standing,
            "consecutive_warning_semesters": a.consecutive_warning_semesters,
            "current_term": {"academic_year": a.current_academic_year, "term_ar": a.current_term_ar,
                             "registered_hours": a.current_registered_hours},
        }
    out["terms"] = [_term_dict(t) for t in st.terms]
    return out


def _term_dict(t: StudentTerm) -> dict:
    out = {
        "academic_year": t.academic_year, "term": t.term, "term_ar": t.term_ar, "status": t.status,
        "courses": [_result_dict(r) for r in t.results],
    }
    if t.status == "published":
        # term_gpa / cumulative_gpa stay null for a term with no graded course (e.g. only a training);
        # summer terms have no academic standing.
        out["summary"] = {k: getattr(t, k) for k in SUMMARY_FIELDS if k != "academic_standing"}
        if t.academic_standing is not None:
            out["summary"]["academic_standing"] = t.academic_standing
    return out


def _result_dict(r: CourseResult) -> dict:
    c = r.course
    return {
        "code": c.code, "name_ar": c.name_ar, "name_en": c.name_en, "credits": c.credits, "attempt": r.attempt,
        **_drop_none({"marks": r.marks, "total": r.total, "grade": r.grade, "grade_ar": r.grade_ar}),
    }


def student_record(s: Session, student_id: str) -> dict | None:
    st = s.scalar(select(Student).where(Student.student_id == str(student_id)).options(*_STUDENT_LOAD))
    return _student_dict(st) if st else None


def students_file(s: Session) -> dict:
    rows = s.scalars(select(Student).options(*_STUDENT_LOAD).order_by(Student.student_id)).all()
    return _with_note(s, "students.json", {
        "generated_for_term": _meta(s, "generated_for_term"),
        "students": [_student_dict(st) for st in rows],
    })


def history_file(s: Session) -> dict:
    """Who taught each student each past course (the rows of course_results that know the instructor)."""
    q = (select(CourseResult, StudentTerm)
         .join(StudentTerm, CourseResult.term_id == StudentTerm.id)
         .where(CourseResult.instructor_id.is_not(None))
         .order_by(StudentTerm.student_id, StudentTerm.seq, CourseResult.position))
    rows = [{
        "student_id": t.student_id, "course_code": r.course_code, "academic_year": t.academic_year,
        "term": t.term, "attempt": r.attempt, "instructor_id": r.instructor_id, "section": r.section,
        "grade": r.grade, "total": r.total,
    } for r, t in s.execute(q)]
    return _with_note(s, "student_instructor_history.json", {"rows": rows})


# ------------------------------------------------------------------------------------------------ program

def _course_dict(c: Course) -> dict:
    return {
        "code": c.code, "name_ar": c.name_ar, "credits": c.credits, "category": c.category, "type": c.type,
        "department": c.department, "weekly_load_hours": c.weekly_load_hours, "assessment": c.assessment,
        "level": c.level, "planned_semester": c.planned_semester,
        "prerequisites": [p.prerequisite_code for p in c.prerequisites],
        "min_level_required": c.min_level_required, "graded": c.graded, "name_en": c.name_en,
        **_drop_none({"description_en": c.description_en, "min_credits_required": c.min_credits_required,
                      "graduation_requirement": c.graduation_requirement}),
        **(c.extra or {}),
    }


def courses_file(s: Session) -> dict:
    p = s.get(Program, 1)
    courses = s.scalars(select(Course).options(selectinload(Course.prerequisites)).order_by(Course.seq)).all()
    pools = s.scalars(select(ElectivePool).options(selectinload(ElectivePool.slots),
                                                   selectinload(ElectivePool.courses))
                      .order_by(ElectivePool.id)).all()
    return {
        "program": _drop_none({
            "name_ar": p.name_ar, "name_en": p.name_en, "faculty": p.faculty, "total_credits": p.total_credits,
            "semesters": p.semesters, "credit_breakdown": p.credit_breakdown,
            "electives_required": p.electives_required, "source": p.source,
        }),
        "rules": p.rules,
        "elective_slots": [{"slot": e.slot, "semester": e.semester, "level": e.level}
                           for e in s.scalars(select(ElectiveSlot).order_by(ElectiveSlot.slot))],
        "courses": [_course_dict(c) for c in courses],
        "elective_pools": [{"level": pl.level, "slots": [x.slot for x in pl.slots], "choose": pl.choose,
                            "courses": [x.course_code for x in pl.courses]} for pl in pools],
    }


# ------------------------------------------------------------------------------------------------ people

def instructors_file(s: Session) -> dict:
    instructors = s.scalars(select(Instructor)).all()
    # "i2" before "i10": order by the number, not the text
    instructors = sorted(instructors, key=lambda i: (len(i.id), i.id))
    return _with_note(s, "instructors.json", {
        "dimensions": _meta(s, "instructor_dimensions", []),
        "instructors": [{"id": i.id, "name_ar": i.name_ar, "name_en": i.name_en, "department": i.department,
                         "style": i.style, "profile": i.profile, "responses": i.responses} for i in instructors],
        "offerings": [{"course_code": o.course_code, "section": o.section, "instructor_id": o.instructor_id,
                       "offered_term": o.offered_term, "responses": o.responses, "profile": o.profile}
                      for o in s.scalars(select(Offering).order_by(Offering.id))],
    })


def instructor_grades_file(s: Session) -> dict:
    rows = s.scalars(select(InstructorCourseYear).order_by(InstructorCourseYear.position))
    return _with_note(s, "instructor_grades.json", {
        "years": _meta(s, "instructor_grade_years", []),
        "gpa_bands": _meta(s, "gpa_bands", {}),
        "this_term": _meta(s, "teaching_this_term", {}),
        "records": [{"instructor_id": r.instructor_id, "course_code": r.course_code, "academic_year": r.academic_year,
                     "students": r.students, "mean": r.mean, "median": r.median, "pass_rate": r.pass_rate,
                     "grades": r.grades, "coursework_avg_pct": r.coursework_avg_pct,
                     "final_avg_pct": r.final_avg_pct, "bonus_added": r.bonus_added, "by_gpa_band": r.by_gpa_band}
                    for r in rows],
    })


def sections_file(s: Session) -> dict:
    return _with_note(s, "sections.json", {"sections": [
        {"course_code": x.course_code, "section": x.section, "offered_term": x.offered_term,
         "capacity": x.capacity, "enrolled": x.enrolled}
        for x in s.scalars(select(SectionSeats).order_by(SectionSeats.position))]})


def advisors_file(s: Session) -> dict:
    advisors = s.scalars(select(Advisor).options(selectinload(Advisor.students)).order_by(Advisor.advisor_id))
    return _with_note(s, "advisors.json", {"advisors": [{
        "advisor_id": a.advisor_id, "name_ar": a.name_ar, "name_en": a.name_en, "title_ar": a.title_ar,
        "email": a.email, "office_ar": a.office_ar, "office_hours_ar": a.office_hours_ar,
        "students": [st.student_id for st in a.students],
    } for a in advisors]})
