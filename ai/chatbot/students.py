"""Mock student records (ai/data/students.json) served to the frontend's "choose a student" screen.

The records are fictional and stand in for the university system until the backend team
connects real student data with the same shape.
"""

import json
from functools import lru_cache
from pathlib import Path

STUDENTS_FILE = Path(__file__).resolve().parents[1] / "data" / "students.json"


@lru_cache(maxsize=1)
def _all() -> dict[str, dict]:
    data = json.loads(STUDENTS_FILE.read_text(encoding="utf-8"))
    return {s["student_id"]: s for s in data["students"]}


def summary(s: dict) -> dict:
    """What the picker card needs: who the student is and their headline numbers."""
    status = s["academic_status"]
    return {
        "student_id": s["student_id"],
        "name_ar": s["personal"]["name_ar"],
        "name_en": s["personal"]["name_en"],
        "gender": s["personal"]["gender"],
        "level": status["level"],
        "level_name": status["name"],
        "earned_hours": status["earned_hours"],
        "required_hours": status["required_hours"],
        "cumulative_gpa": status["cumulative_gpa"],
        "academic_standing": status["academic_standing"],
        "demo_case": s["persona_note"],  # why this mock student exists (shown only in the demo picker)
    }


def list_students() -> list[dict]:
    return [summary(s) for s in _all().values()]


def get_student(student_id: str) -> dict | None:
    return _all().get(student_id)
