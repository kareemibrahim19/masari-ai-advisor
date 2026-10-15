"""Saved choices API: the recommendations page saves what the student chose here, so a refresh or another device
shows the same courses, preference sliders and hidden instructors.

    GET /api/students/{student_id}/choices   the saved choices, or {"choices": null} if none yet
    PUT /api/students/{student_id}/choices   save them (the newest save wins)

Stored in the database from ai/db (DATABASE_URL). If the database cannot be reached the endpoints answer 503 and
the page keeps its choices until the next refresh, as before.
"""

import sys
from collections.abc import Callable
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import auth  # noqa: E402  (only the signed-in student's own choices, once MASARI_REQUIRE_AUTH is on)
from db import choices as store  # noqa: E402
from db.database import SessionLocal  # noqa: E402

router = APIRouter()
_tables_ready = set()  # databases whose choices table is known to exist


def get_session():
    with SessionLocal() as s:
        yield s


def _run(s: Session, work: Callable[[], object]):
    """Run `work` in one transaction (creating the table the first time); database errors become 503."""
    try:
        bind = s.get_bind()
        if bind.url not in _tables_ready:
            store.create_tables(bind)
            _tables_ready.add(bind.url)
        result = work()
        s.commit()
        return result
    except SQLAlchemyError as e:
        s.rollback()
        raise HTTPException(503, "Saved choices are not available right now") from e


class Prefs(BaseModel):
    """The three sliders on the instructors tab, 0 to 100 (frontend StudentPrefs)."""
    pace: int = Field(ge=0, le=100)
    workload: int = Field(ge=0, le=100)
    practical: int = Field(ge=0, le=100)


class ChoicesBody(BaseModel):
    selected: list[str] = Field(max_length=40)  # course codes, e.g. "CSE 315"
    prefs: Prefs | None = None  # null until the student moves a slider
    excluded: list[str] = Field(default=[], max_length=100)  # instructor keys: "i4", or "i4:CSE 315" for one course
    updatedAt: int = Field(ge=0)  # ms since 1970, as the website's Date.now()


@router.get("/api/students/{student_id}/choices")
def get_choices(student_id: str = Depends(auth.own_student), s: Session = Depends(get_session)):
    return {"choices": _run(s, lambda: store.get_choices(s, student_id))}


@router.put("/api/students/{student_id}/choices")
def save_choices(body: ChoicesBody, student_id: str = Depends(auth.own_student), s: Session = Depends(get_session)):
    if any(len(x) > 32 for x in body.selected + body.excluded):
        raise HTTPException(400, "Bad course code or instructor key")
    data = body.model_dump(exclude={"updatedAt"})
    return {"choices": _run(s, lambda: store.save_choices(s, student_id, data, body.updatedAt))}
