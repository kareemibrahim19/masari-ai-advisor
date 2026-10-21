"""Checks for the Masari database: load ai/data into a fresh in-memory SQLite database, read it back with
db/export.py and compare with the files, field by field. Run from the repo root:
    .venv/Scripts/python.exe ai/tests/test_db.py
No database server or network needed.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from db import export  # noqa: E402
from db.database import make_engine  # noqa: E402
from db.models import Base, CourseResult, Student, StudentTerm  # noqa: E402
from db.seed import DATA_DIR, create_and_seed  # noqa: E402

failures = []


def check(name, cond, got=None):
    if not cond:
        failures.append(f"{name}: {got}")
    print(("ok   " if cond else "FAIL ") + name)


def load(name):
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


def first_diff(a, b, path="$"):
    """Where two JSON values first differ (None if equal), so a failure says what is wrong."""
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b), key=str):
            if k not in a or k not in b:
                return f"{path}.{k}: only in {'file' if k in a else 'database'}"
            if d := first_diff(a[k], b[k], f"{path}.{k}"):
                return d
        return None
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return f"{path}: {len(a)} items in file, {len(b)} in database"
        for i, (x, y) in enumerate(zip(a, b)):
            if d := first_diff(x, y, f"{path}[{i}]"):
                return d
        return None
    # Strict on type too: 99 coming back as 99.0 would show as "99.0" in the chat's answers.
    return None if a == b and type(a) is type(b) else f"{path}: file {a!r} != database {b!r}"


engine = make_engine("sqlite://")
counts = create_and_seed(engine)
check("seed loads every table", all(n > 0 for n in counts.values()), counts)

with Session(engine) as s:
    # Each file comes back exactly. Lists whose order the database does not keep are compared sorted.
    by_id = lambda rows, key: sorted(rows, key=lambda r: r[key])  # noqa: E731

    f, d = load("students.json"), export.students_file(s)
    f["students"], d["students"] = by_id(f["students"], "student_id"), by_id(d["students"], "student_id")
    check("students.json round-trips", (x := first_diff(f, d)) is None, x)

    f, d = load("courses.json"), export.courses_file(s)
    check("courses.json round-trips (catalog order kept)", (x := first_diff(f, d)) is None, x)

    f, d = load("instructors.json"), export.instructors_file(s)
    check("instructors.json round-trips", (x := first_diff(f, d)) is None, x)

    f, d = load("advisors.json"), export.advisors_file(s)
    for a in f["advisors"] + d["advisors"]:
        a["students"] = sorted(a["students"])
    check("advisors.json round-trips", (x := first_diff(f, d)) is None, x)

    key = lambda r: (r["student_id"], r["academic_year"], r["term"], r["course_code"], r["attempt"])  # noqa: E731
    f, d = load("student_instructor_history.json"), export.history_file(s)
    f["rows"], d["rows"] = sorted(f["rows"], key=key), sorted(d["rows"], key=key)
    check("student_instructor_history.json round-trips", (x := first_diff(f, d)) is None, x)

    f, d = load("sections.json"), export.sections_file(s)
    check("sections.json round-trips", (x := first_diff(f, d)) is None, x)

    f, d = load("instructor_grades.json"), export.instructor_grades_file(s)
    check("instructor_grades.json round-trips", (x := first_diff(f, d)) is None, x)

    sid = load("students.json")["students"][1]["student_id"]
    one = next(st for st in load("students.json")["students"] if st["student_id"] == sid)
    check("student_record returns one student", first_diff(one, export.student_record(s, sid)) is None)
    check("student_record of an unknown id is None", export.student_record(s, "000") is None)

    st = s.get(Student, sid)
    check("student has an advisor", st.advisor is not None and st.advisor.email.endswith(".example"))
    check("in-progress term has no grades",
          all(r.grade is None for t in st.terms if t.status == "in_progress" for r in t.results))

# The database refuses data that does not fit, like Postgres would (foreign keys and unique rows).
with Session(engine) as s:
    term = s.query(StudentTerm).first()
    s.add(CourseResult(term_id=term.id, course_code="XXX 999", attempt=1))
    try:
        s.flush()
        check("unknown course code is refused", False, "inserted")
    except IntegrityError:
        check("unknown course code is refused", True)
    s.rollback()

    code = term.results[0].course_code
    s.add(CourseResult(term_id=term.id, course_code=code, attempt=1))
    try:
        s.flush()
        check("same course twice in one term is refused", False, "inserted")
    except IntegrityError:
        check("same course twice in one term is refused", True)
    s.rollback()

# Seeding twice without --reset stops instead of mixing old and new data; --reset starts over.
try:
    create_and_seed(engine)
    check("second seed without --reset stops", False, "seeded again")
except SystemExit:
    check("second seed without --reset stops", True)
check("--reset loads again", create_and_seed(engine, reset=True) == counts)

# db/source.py: the AI service reads people from the database when DATABASE_URL is set, else from the files.
import os  # noqa: E402

from sqlalchemy.orm import sessionmaker  # noqa: E402

import db.database  # noqa: E402
from db import source  # noqa: E402


def use_database(url, eng):
    """Point source.py at `eng` as if DATABASE_URL were `url`, and forget what it read before."""
    if url:
        os.environ["DATABASE_URL"] = url
    else:
        os.environ.pop("DATABASE_URL", None)
    db.database.SessionLocal = sessionmaker(bind=eng)
    source._database.cache_clear()


saved_url, saved_sessions = os.environ.get("DATABASE_URL"), db.database.SessionLocal
use_database("sqlite://", engine)
check("source reads the database when DATABASE_URL is set", source.active() == "database", source.active())
f, d = load("students.json"), source.load("students.json")
f["students"], d["students"] = by_id(f["students"], "student_id"), by_id(d["students"], "student_id")
check("source gives the same students as the file", (x := first_diff(f, d)) is None, x)
check("source reads courses.json from the file", source.load("courses.json") == load("courses.json"))

use_database(None, engine)
check("source reads the files without DATABASE_URL", source.active() == "files", source.active())

use_database("sqlite://", make_engine(f"sqlite:///{(DATA_DIR / 'missing-dir' / 'x.db').as_posix()}"))
check("source falls back to the files when the database fails", source.active() == "files", source.active())
check("fallback still has the students", source.load("students.json") == load("students.json"))

empty = make_engine("sqlite://")
Base.metadata.create_all(empty)  # the tables, never seeded
use_database("sqlite://", empty)
check("source falls back to the files when the database has no students", source.active() == "files",
      source.active())

os.environ.pop("DATABASE_URL", None)
if saved_url:
    os.environ["DATABASE_URL"] = saved_url
db.database.SessionLocal = saved_sessions
source._database.cache_clear()

# Hosted Postgres URLs are rewritten for pg8000 (pure Python) with SSL.
neon = make_engine("postgresql://u:p@ep-x.neon.tech/masari?sslmode=require&channel_binding=require")
check("Neon URL uses pg8000 without libpq options",
      neon.url.drivername == "postgresql+pg8000" and not neon.url.query, neon.url)
local = make_engine("postgres://u:p@localhost:5432/masari")
check("postgres:// on localhost uses pg8000", local.url.drivername == "postgresql+pg8000", local.url)

print()
if failures:
    print(f"{len(failures)} failed:")
    for f in failures:
        print("  " + f)
    sys.exit(1)
print("All database checks passed.")
