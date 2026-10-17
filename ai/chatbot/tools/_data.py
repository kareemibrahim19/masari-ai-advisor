"""Shared data access for the Masari tools: courses, rules, students, instructors and teaching assistants, loaded once.

Students, advisors and instructors come from the database when DATABASE_URL is set, else from ai/data
(see ai/db/source.py); courses and rules always come from ai/data/courses.json.
"""

import re
import sys
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from db.source import load as _load  # noqa: E402


@lru_cache(maxsize=1)
def program() -> dict:
    return _load("courses.json")


def rules() -> dict:
    return program()["rules"]


@lru_cache(maxsize=1)
def courses() -> dict[str, dict]:
    return {c["code"]: c for c in program()["courses"]}


@lru_cache(maxsize=1)
def students() -> dict[str, dict]:
    return {s["student_id"]: s for s in _load("students.json")["students"]}


@lru_cache(maxsize=1)
def advisors() -> dict[str, dict]:
    """Mock academic advisors (advisors.json), keyed by the student id they advise."""
    return {sid: a for a in _load("advisors.json")["advisors"] for sid in a["students"]}


def advisor_of(student_id: str | None) -> dict | None:
    return advisors().get(student_id) if student_id else None


@lru_cache(maxsize=1)
def instructor_data() -> dict:
    return _load("instructors.json")


@lru_cache(maxsize=1)
def teaching_assistant_data() -> dict:
    """Teaching assistants and the courses they teach this term (always from ai/data/teaching_assistants.json)."""
    return _load("teaching_assistants.json")


# ---------------------------------------------------------------- lookups

def normalize_code(text: str) -> str | None:
    """'ari381', 'ARI 381' or 'ari-381' -> 'ARI 381' (None if it is not a code shape)."""
    m = re.fullmatch(r"\s*([A-Za-z]{3})[\s\-_]*(\d{3})\s*", text or "")
    return f"{m.group(1).upper()} {m.group(2)}" if m else None


def find_course(query: str) -> dict | None:
    """Find a course by code or by (part of) its Arabic / English name."""
    code = normalize_code(query)
    if code:
        return courses().get(code)
    q = (query or "").strip().lower()
    if not q:
        return None
    for c in courses().values():
        names = [c["name_ar"], c.get("name_en", ""), *c.get("aliases_en", [])]
        if any(q == n.lower() for n in names if n):
            return c
    for c in courses().values():
        names = [c["name_ar"], c.get("name_en", ""), *c.get("aliases_en", [])]
        if any(q in n.lower() for n in names if n):
            return c
    return None


def get_student(student_id: str) -> dict | None:
    return students().get(str(student_id))


def course_label(code: str) -> str:
    c = courses().get(code)
    return f"{code} {c['name_ar']}" if c else code


# Grades that are not letters: a withdrawal (article 15) has no grade and leaves the course not passed and out of
# the GPA; a student deprived for absence (over 25%) gets "DN", which counts in the GPA as 0.
WITHDRAWN = "W"
DEPRIVED = "DN"
FAILING = ("F", "FP", DEPRIVED)


def best_attempts(student: dict) -> dict[str, dict]:
    """code -> the student's latest graded attempt (the latest attempt is the one that counts). A withdrawal is not
    an attempt: it does not replace an earlier grade."""
    best = {}
    for t in student["terms"]:
        if t["status"] != "published":
            continue
        for c in t["courses"]:
            if c.get("grade") != WITHDRAWN:
                best[c["code"]] = c
    return best


def passed(attempt: dict | None) -> bool:
    """A pass (P) or a passing letter grade. F, FP, a deprivation (DN), a withdrawal or no grade is not a pass."""
    if not attempt:
        return False
    g = attempt.get("grade")
    return g == "P" or (g in rules()["grade_points"] and g not in FAILING)


def current_courses(student: dict) -> list[dict]:
    for t in student["terms"]:
        if t["status"] == "in_progress":
            return t["courses"]
    return []


def prereqs(course: dict) -> list[str]:
    """Prerequisites, plus the project before this one (project 1 -> 2 -> 3, one project per semester)."""
    order = rules().get("project_order", {}).get("courses", [])
    extra = [order[order.index(course["code"]) - 1]] if course["code"] in order[1:] else []
    return list(dict.fromkeys(course["prerequisites"] + extra))


def hours_needed(course: dict) -> tuple[int, int]:
    """(hours the course asks for, the fewest it can be registered with). Projects can be registered a few
    hours short (4 for ARI 381 / 481, 6 for ARI 482) by paper registration at the faculty."""
    need = course.get("min_credits_required") or 0
    return need, need - (course.get("min_credits_tolerance") or 0)


def not_found(what: str, value: str) -> dict:
    return {"error": f"{what} '{value}' مش موجود", "found": False}
