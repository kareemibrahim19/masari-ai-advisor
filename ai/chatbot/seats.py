"""Seats per section, and seat requests for full sections.

    GET    /api/sections                                         seats of every section offered this term
    GET    /api/students/{student_id}/seat-requests              the student's requests
    POST   /api/students/{student_id}/seat-requests              ask for a seat in a full section
    DELETE /api/students/{student_id}/seat-requests/{request_id} withdraw a request

The seats come from ai/data/sections.json (or the database, see ai/db/source.py; simulated until the faculty's
registration system gives the real numbers). "This term" is the term the student data is for (students.json
generated_for_term): sections offered in that term or in both terms. Requests are stored with ai/db (DATABASE_URL);
if the database cannot be reached those endpoints answer 503.
"""

import sys
from collections.abc import Callable
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import auth  # noqa: E402  (only the signed-in student's own requests, once MASARI_REQUIRE_AUTH is on)
from db import seat_requests as store  # noqa: E402
from db import source  # noqa: E402
from db.database import SessionLocal  # noqa: E402

router = APIRouter()
_tables_ready = set()  # databases whose seat_requests table is known to exist


def current_term() -> str:
    return source.load("students.json")["generated_for_term"]["term"]


def sections_now() -> dict[str, list[dict]]:
    """Sections offered this term, by course code, in section order: section, capacity, enrolled, seats left and
    the instructor who teaches it."""
    term = current_term()
    teacher = {(o["course_code"], o["section"], o["offered_term"]): o["instructor_id"]
               for o in source.load("instructors.json")["offerings"]}
    out: dict[str, list[dict]] = {}
    for x in source.load("sections.json")["sections"]:
        if x["offered_term"] not in (term, "both"):
            continue
        out.setdefault(x["course_code"], []).append({
            "section": x["section"], "capacity": x["capacity"], "enrolled": x["enrolled"],
            "seats_left": max(0, x["capacity"] - x["enrolled"]),
            "instructor_id": teacher.get((x["course_code"], x["section"], x["offered_term"])),
            "offered_term": x["offered_term"]})
    for sections in out.values():
        sections.sort(key=lambda s: (len(s["section"]), s["section"]))
    return out


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
        raise HTTPException(503, "Seat requests are not available right now") from e


@router.get("/api/sections")
def list_sections():
    """Not personal data, so it answers without signing in (like the instructors' course list)."""
    return {"term": current_term(), "courses": sections_now()}


class SeatRequestBody(BaseModel):
    course_code: str = Field(min_length=1, max_length=16)
    section: str = Field(min_length=1, max_length=8)


@router.get("/api/students/{student_id}/seat-requests")
def list_requests(student_id: str = Depends(auth.own_student), s: Session = Depends(get_session)):
    return {"requests": _run(s, lambda: store.list_requests(s, student_id))}


@router.post("/api/students/{student_id}/seat-requests")
def request_seat(body: SeatRequestBody, response: Response, student_id: str = Depends(auth.own_student),
                 s: Session = Depends(get_session)):
    section = next((x for x in sections_now().get(body.course_code, []) if x["section"] == body.section), None)
    if not section:
        raise HTTPException(404, "No such section this term")
    if section["seats_left"] > 0:
        raise HTTPException(409, "This section still has seats; register in it directly")
    made, new = _run(s, lambda: store.request_seat(s, student_id, body.course_code, body.section,
                                                   section["offered_term"]))
    response.status_code = 201 if new else 200
    return made


@router.delete("/api/students/{student_id}/seat-requests/{request_id}")
def cancel_request(request_id: int, student_id: str = Depends(auth.own_student), s: Session = Depends(get_session)):
    if not _run(s, lambda: store.cancel_request(s, student_id, request_id)):
        raise HTTPException(404, "Request not found")
    return {"deleted": request_id}
