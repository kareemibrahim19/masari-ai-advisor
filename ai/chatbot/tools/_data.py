"""Shared data access for the Masari tools: courses, rules, students and instructors, loaded once."""

import json
import re
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[2] / "data"


def _load(name: str) -> dict:
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


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
def instructor_data() -> dict:
    return _load("instructors.json")


@lru_cache(maxsize=1)
def history_rows() -> list[dict]:
    return _load("student_instructor_history.json")["rows"]


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


def best_attempts(student: dict) -> dict[str, dict]:
    """code -> the student's latest graded attempt (the latest attempt is the one that counts)."""
    best = {}
    for t in student["terms"]:
        if t["status"] != "published":
            continue
        for c in t["courses"]:
            best[c["code"]] = c
    return best


def passed(attempt: dict | None) -> bool:
    return bool(attempt) and attempt["grade"] not in ("F", "FP")


def current_courses(student: dict) -> list[dict]:
    for t in student["terms"]:
        if t["status"] == "in_progress":
            return t["courses"]
    return []


def not_found(what: str, value: str) -> dict:
    return {"error": f"{what} '{value}' مش موجود", "found": False}
