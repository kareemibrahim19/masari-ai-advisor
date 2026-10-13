"""Where the AI service reads its data: the database when DATABASE_URL is set, otherwise the ai/data/*.json files.

    load("students.json")   the same dict either way (export.py returns the database in the files' exact shape)
    active()                "database" or "files", for /api/health

From the database: the people data the backend owns (students and their grades, advisors, instructors, who taught
whom). Always from the files: courses.json (the program and the regulation rules change together with the planner
code, in the same commit) and regulations_chunks.json (the RAG text, with its embedding cache keyed to the file).

The database is read once per process, like the files were. If it cannot be read (no connection, tables missing,
nothing seeded) the service uses the files instead and keeps working.
"""

import json
import logging
import os
import sys
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
FROM_DB = ("students.json", "advisors.json", "instructors.json", "student_instructor_history.json")

log = logging.getLogger("masari.data")


def _file(name: str) -> dict:
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _database() -> dict[str, dict] | None:
    """All FROM_DB files read from the database, or None to use the JSON files."""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from db import export
        from db.database import SessionLocal  # also loads .env
    except ImportError as e:
        log.warning("Masari data: reading ai/data files (database code not importable: %s)", e)
        return None
    if not os.getenv("DATABASE_URL"):
        return None
    readers = {"students.json": export.students_file, "advisors.json": export.advisors_file,
               "instructors.json": export.instructors_file, "student_instructor_history.json": export.history_file}
    try:
        with SessionLocal() as s:
            out = {name: read(s) for name, read in readers.items()}
    except Exception as e:  # noqa: BLE001  any database failure falls back to the files
        # Only the error type: the message of a connection error can name the host and user.
        log.warning("Masari data: reading ai/data files (database not available: %s)", type(e).__name__)
        return None
    if not out["students.json"]["students"]:
        log.warning("Masari data: reading ai/data files (the database has no students; run ai/db/seed.py)")
        return None
    return out


def load(name: str) -> dict:
    db = _database() if name in FROM_DB else None
    return db[name] if db else _file(name)


def active() -> str:
    return "database" if _database() else "files"
