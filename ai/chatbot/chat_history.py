"""Recent chats API: the chat page saves each student's chats here, so they follow the account to any device.

    GET    /api/students/{student_id}/chats             the student's chats, newest first (at most 20)
    PUT    /api/students/{student_id}/chats/{chat_id}   create or replace one chat
    DELETE /api/students/{student_id}/chats/{chat_id}   delete one chat

Stored in the database from ai/db (DATABASE_URL). If the database cannot be reached the endpoints answer 503 and
the website keeps the chats in the browser only, as before, so the chat itself never breaks.
"""

import sys
from collections.abc import Callable
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import students  # noqa: E402
from db import chats as store  # noqa: E402
from db.database import SessionLocal  # noqa: E402

router = APIRouter()
_tables_ready = set()  # databases whose chat tables are known to exist


def get_session():
    with SessionLocal() as s:
        yield s


def known_student(student_id: str) -> str:
    if not students.get_student(student_id):
        raise HTTPException(404, "Student not found")
    return student_id


def _run(s: Session, work: Callable[[], object]):
    """Run `work` in one transaction (creating the chat tables the first time); database errors become 503."""
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
        raise HTTPException(503, "Chat history is not available right now") from e


class ChatBody(BaseModel):
    title: str = Field("", max_length=300)
    updatedAt: int = Field(ge=0)  # ms since 1970, as the website's Date.now()
    messages: list[dict] = Field(max_length=store.MAX_MESSAGES)


@router.get("/api/students/{student_id}/chats")
def list_chats(student_id: str = Depends(known_student), s: Session = Depends(get_session)):
    return {"chats": _run(s, lambda: store.list_chats(s, student_id))}


@router.put("/api/students/{student_id}/chats/{chat_id}")
def save_chat(body: ChatBody, chat_id: str, student_id: str = Depends(known_student),
              s: Session = Depends(get_session)):
    if len(chat_id) > 64:
        raise HTTPException(400, "Bad chat id")
    try:
        return _run(s, lambda: store.save_chat(s, student_id, chat_id, body.title, body.updatedAt, body.messages))
    except store.NotYours:
        s.rollback()
        raise HTTPException(404, "Chat not found")


@router.delete("/api/students/{student_id}/chats/{chat_id}")
def delete_chat(chat_id: str, student_id: str = Depends(known_student), s: Session = Depends(get_session)):
    if not _run(s, lambda: store.delete_chat(s, student_id, chat_id)):
        raise HTTPException(404, "Chat not found")
    return {"deleted": chat_id}
