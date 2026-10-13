"""Fill the database from the JSON files in ai/data (the mock data today, real exports later).

Run from the repo root:
    .venv\\Scripts\\python.exe ai\\db\\seed.py           create the tables and load the data (empty database only)
    .venv\\Scripts\\python.exe ai\\db\\seed.py --reset   drop the data tables first, then load (saved chats are kept)

The database is the one DATABASE_URL points to (default: SQLite file ai/masari.db). See ai/db/README.md.
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

from sqlalchemy import func, inspect, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db.models import (  # noqa: E402
    AcademicStatus, Advisor, Base, Course, CoursePrerequisite, CourseResult, ElectivePool, ElectivePoolCourse,
    ElectivePoolSlot, ElectiveSlot, Guardian, Instructor, Meta, Offering, PreviousQualification, Program, Student,
    StudentTerm)

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

# Course fields with their own column; anything else in a course entry is kept in courses.extra.
COURSE_COLUMNS = {"code", "name_ar", "name_en", "credits", "category", "type", "department", "weekly_load_hours",
                  "level", "planned_semester", "min_level_required", "min_credits_required", "graded",
                  "graduation_requirement", "assessment", "description_en", "prerequisites"}


def load_json(name: str, data_dir: Path = DATA_DIR) -> dict:
    return json.loads((data_dir / name).read_text(encoding="utf-8"))


def seed(session: Session, data_dir: Path = DATA_DIR) -> dict[str, int]:
    """Insert everything from data_dir into an empty schema. Returns row counts per table."""
    courses_file = load_json("courses.json", data_dir)
    instructors_file = load_json("instructors.json", data_dir)
    advisors_file = load_json("advisors.json", data_dir)
    students_file = load_json("students.json", data_dir)
    history_file = load_json("student_instructor_history.json", data_dir)

    # meta: the facts that sit next to the lists in each file
    session.add_all([
        Meta(key="generated_for_term", value=students_file["generated_for_term"]),
        Meta(key="instructor_dimensions", value=instructors_file["dimensions"]),
        Meta(key="notes", value={f: d["_note"] for f, d in (
            ("students.json", students_file), ("instructors.json", instructors_file),
            ("advisors.json", advisors_file), ("student_instructor_history.json", history_file)) if "_note" in d}),
    ])

    # program, courses, prerequisites, electives
    p = courses_file["program"]
    session.add(Program(id=1, name_ar=p["name_ar"], name_en=p["name_en"], faculty=p["faculty"],
                        total_credits=p["total_credits"], semesters=p["semesters"],
                        electives_required=p["electives_required"], source=p.get("source"),
                        credit_breakdown=p["credit_breakdown"], rules=courses_file["rules"]))
    for seq, c in enumerate(courses_file["courses"]):
        session.add(Course(
            code=c["code"], seq=seq, name_ar=c["name_ar"], name_en=c["name_en"], credits=c["credits"], category=c["category"],
            type=c["type"], department=c["department"], weekly_load_hours=c["weekly_load_hours"], level=c["level"],
            planned_semester=c.get("planned_semester"), min_level_required=c.get("min_level_required"),
            min_credits_required=c.get("min_credits_required"), graded=c["graded"],
            graduation_requirement=c.get("graduation_requirement"), assessment=c["assessment"],
            description_en=c.get("description_en"),
            extra={k: v for k, v in c.items() if k not in COURSE_COLUMNS}))
    session.flush()  # prerequisites point at courses, so every course must exist first
    for c in courses_file["courses"]:
        for i, pre in enumerate(c["prerequisites"]):
            session.add(CoursePrerequisite(course_code=c["code"], prerequisite_code=pre, position=i))
    for s in courses_file["elective_slots"]:
        session.add(ElectiveSlot(slot=s["slot"], semester=s["semester"], level=s["level"]))
    session.flush()
    for pool in courses_file["elective_pools"]:
        row = ElectivePool(level=pool["level"], choose=pool["choose"])
        row.slots = [ElectivePoolSlot(slot=s, position=i) for i, s in enumerate(pool["slots"])]
        row.courses = [ElectivePoolCourse(course_code=c, position=i) for i, c in enumerate(pool["courses"])]
        session.add(row)

    # instructors and their sections
    for i in instructors_file["instructors"]:
        session.add(Instructor(id=i["id"], name_ar=i["name_ar"], name_en=i["name_en"], department=i["department"],
                               style=i.get("style"), responses=i["responses"], profile=i["profile"]))
    session.flush()
    for o in instructors_file["offerings"]:
        session.add(Offering(course_code=o["course_code"], section=o["section"], instructor_id=o["instructor_id"],
                             offered_term=o["offered_term"], responses=o["responses"], profile=o["profile"]))

    # advisors, then students (a student points at an advisor)
    advisor_of = {}
    for a in advisors_file["advisors"]:
        session.add(Advisor(advisor_id=a["advisor_id"], name_ar=a["name_ar"], name_en=a["name_en"],
                            title_ar=a.get("title_ar"), email=a["email"], office_ar=a.get("office_ar"),
                            office_hours_ar=a.get("office_hours_ar")))
        advisor_of.update({sid: a["advisor_id"] for sid in a["students"]})
    session.flush()

    taught_by = {(h["student_id"], h["course_code"], h["academic_year"], h["term"], h["attempt"]): h
                 for h in history_file["rows"]}
    for s in students_file["students"]:
        session.add(_student(s, advisor_of.get(s["student_id"]), taught_by))
    session.flush()

    # Every history row must have landed on a course result, or it would be lost silently.
    linked = session.scalar(select(func.count()).select_from(CourseResult)
                            .where(CourseResult.instructor_id.is_not(None)))
    if linked != len(history_file["rows"]):
        raise ValueError(f"student_instructor_history.json: {len(history_file['rows'])} rows, "
                         f"only {linked} match a course in students.json")

    return {t.name: session.scalar(select(func.count()).select_from(t)) for t in DATA_TABLES}


def _student(s: dict, advisor_id: str | None, taught_by: dict) -> Student:
    per, con, enr = s["personal"], s["contact"], s["enrollment"]
    row = Student(
        student_id=s["student_id"], name_ar=per["name_ar"], name_en=per["name_en"], gender=per["gender"],
        birth_date=date.fromisoformat(per["birth_date"]) if per.get("birth_date") else None,
        birth_place=per.get("birth_place"), nationality=per.get("nationality"), national_id=per.get("national_id"),
        id_type=per.get("id_type"), governorate=con.get("governorate"), city=con.get("city"),
        address=con.get("address"), mobile=con.get("mobile"), university_email=con.get("university_email"),
        university=enr["university"], faculty=enr["faculty"], program=enr["program"],
        enrollment_year=enr["enrollment_year"], advisor_id=advisor_id,
        persona=s.get("persona"), persona_note=s.get("persona_note"))

    if g := s.get("guardian"):
        row.guardian = Guardian(name=g["name"], relation=g.get("relation"), job=g.get("job"), mobile=g.get("mobile"))
    if q := s.get("previous_qualification"):
        row.previous_qualification = PreviousQualification(**q)

    st = s["academic_status"]
    cur = st["current_term"]
    row.academic_status = AcademicStatus(
        level=st["level"], level_name=st["name"], required_hours=st["required_hours"],
        earned_hours=st["earned_hours"], mandatory_hours=st["mandatory_hours"], elective_hours=st["elective_hours"],
        project_hours=st["project_hours"], trainings_passed=st["trainings_passed"],
        cumulative_gpa=st["cumulative_gpa"], main_semesters_completed=st["main_semesters_completed"],
        academic_standing=st["academic_standing"],
        consecutive_warning_semesters=st["consecutive_warning_semesters"],
        current_academic_year=cur["academic_year"], current_term_ar=cur["term_ar"],
        current_registered_hours=cur["registered_hours"])

    for seq, t in enumerate(s["terms"]):
        summ = t.get("summary") or {}
        term = StudentTerm(seq=seq, academic_year=t["academic_year"], term=t["term"], term_ar=t["term_ar"],
                           status=t["status"], **{k: summ.get(k) for k in SUMMARY_FIELDS})
        for pos, c in enumerate(t["courses"]):
            h = taught_by.get((s["student_id"], c["code"], t["academic_year"], t["term"], c["attempt"]), {})
            term.results.append(CourseResult(
                course_code=c["code"], position=pos, attempt=c["attempt"], marks=c.get("marks"),
                total=c.get("total"), grade=c.get("grade"), grade_ar=c.get("grade_ar"),
                instructor_id=h.get("instructor_id"), section=h.get("section")))
        row.terms.append(term)
    return row


# The tables seed() fills from ai/data. The others (chats) hold what students saved and are never reset.
DATA_TABLES = [t for t in Base.metadata.sorted_tables if t.name not in ("chats", "chat_messages")]

SUMMARY_FIELDS = ("registered_hours", "earned_hours", "term_gpa", "cumulative_gpa", "cumulative_earned_hours",
                  "academic_standing")


def create_and_seed(engine: Engine, reset: bool = False, data_dir: Path = DATA_DIR) -> dict[str, int]:
    if reset:
        # Only the tables loaded from ai/data: what students saved (their chats) is kept.
        Base.metadata.drop_all(engine, tables=DATA_TABLES)
    elif "program" in inspect(engine).get_table_names():
        with Session(engine) as s:
            if s.scalar(select(Program.id).limit(1)) is not None:
                raise SystemExit("The database already has Masari data. Use --reset to drop it and load again.")
    Base.metadata.create_all(engine)
    with Session(engine) as session, session.begin():
        return seed(session, data_dir)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reset", action="store_true", help="drop the data tables first (saved chats are kept)")
    args = parser.parse_args()

    from db.database import engine
    print(f"Database: {engine.url.render_as_string(hide_password=True)}")
    counts = create_and_seed(engine, reset=args.reset)
    for table, n in counts.items():
        print(f"  {table:<26}{n:>5}")
    print("Done.")
