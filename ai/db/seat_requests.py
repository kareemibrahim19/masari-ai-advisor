"""Seat requests: a student asks for a seat in a full section ("Request a seat" on the website).

One request per student, section and term: asking again returns the request already made. The faculty reviews them
later (status pending → approved / declined); until there is a screen for that, they are listed in the database.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from db.models import SeatRequest


def create_tables(engine: Engine) -> None:
    SeatRequest.__table__.create(engine, checkfirst=True)


def _to_dict(r: SeatRequest) -> dict:
    return {"id": r.id, "course_code": r.course_code, "section": r.section, "offered_term": r.offered_term,
            "status": r.status, "created_at": r.created_at.replace(tzinfo=timezone.utc).isoformat()}


def list_requests(s: Session, student_id: str) -> list[dict]:
    """The student's requests, oldest first."""
    rows = s.scalars(select(SeatRequest).where(SeatRequest.student_id == student_id).order_by(SeatRequest.id))
    return [_to_dict(r) for r in rows]


def request_seat(s: Session, student_id: str, course_code: str, section: str, term: str) -> tuple[dict, bool]:
    """Make the request, or return the one already made. The bool says whether it is new."""
    row = s.scalar(select(SeatRequest).where(
        SeatRequest.student_id == student_id, SeatRequest.course_code == course_code,
        SeatRequest.section == section, SeatRequest.offered_term == term))
    if row:
        return _to_dict(row), False
    row = SeatRequest(student_id=student_id, course_code=course_code, section=section, offered_term=term,
                      status="pending", created_at=datetime.now(timezone.utc).replace(tzinfo=None))
    s.add(row)
    s.flush()
    return _to_dict(row), True


def cancel_request(s: Session, student_id: str, request_id: int) -> bool:
    """Withdraw one of the student's requests. False if the student has no request with this id."""
    row = s.get(SeatRequest, request_id)
    if not row or row.student_id != student_id:
        return False
    s.delete(row)
    return True
