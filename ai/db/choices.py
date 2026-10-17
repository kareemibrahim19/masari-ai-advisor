"""What each student chose on the recommendations page, saved so a refresh or another device shows the same thing.

The website sends all of it each time something changes: { selected: [course codes], updatedAt (ms since 1970) }. The newest save wins, so a page left
open on an old device cannot undo what was chosen later on another one.
"""

from datetime import datetime, timezone

from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from db.models import StudentChoices


def create_tables(engine: Engine) -> None:
    StudentChoices.__table__.create(engine, checkfirst=True)


def _utc(ms: int) -> datetime:
    # Stored without a time zone (SQLite keeps none), always meaning UTC.
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).replace(tzinfo=None)


def _ms(dt: datetime) -> int:
    return round(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)


def _to_dict(row: StudentChoices) -> dict:
    return {**row.choices, "updatedAt": _ms(row.updated_at)}


def get_choices(s: Session, student_id: str) -> dict | None:
    """The student's saved choices, or None if they never saved any."""
    row = s.get(StudentChoices, student_id)
    return _to_dict(row) if row else None


def save_choices(s: Session, student_id: str, choices: dict, updated_at_ms: int) -> dict:
    """Save the student's choices unless a newer save is already stored; returns what is stored now."""
    row = s.get(StudentChoices, student_id)
    when = _utc(updated_at_ms)
    if row and row.updated_at > when:
        return _to_dict(row)
    if not row:
        row = StudentChoices(student_id=student_id)
        s.add(row)
    row.choices = choices
    row.updated_at = when
    s.flush()
    return _to_dict(row)
