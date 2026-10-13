"""Recent chats saved per student, so they show on every device and browser the student signs in from.

The website sends a whole chat each time it changes (a question, then the answer) and the server keeps the newest
MAX_CHATS per student, the same rule the page used with localStorage. The chat's shape is the website's
SavedChat (frontend/src/lib/chat-history.ts): { id, title, updatedAt (ms since 1970), messages: [...] }.
"""

from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, selectinload

from db.models import Chat, ChatMessageRow

MAX_CHATS = 20
MAX_MESSAGES = 200  # per chat; a longer chat keeps its newest messages


class NotYours(Exception):
    """The chat id belongs to another student."""


def create_tables(engine: Engine) -> None:
    Chat.__table__.create(engine, checkfirst=True)
    ChatMessageRow.__table__.create(engine, checkfirst=True)


def _utc(ms: int) -> datetime:
    # Stored without a time zone (SQLite keeps none), always meaning UTC.
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).replace(tzinfo=None)


def _ms(dt: datetime) -> int:
    return round(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)


def _to_dict(c: Chat) -> dict:
    return {"id": c.id, "title": c.title, "updatedAt": _ms(c.updated_at), "messages": [m.message for m in c.messages]}


def list_chats(s: Session, student_id: str) -> list[dict]:
    """The student's chats, newest first."""
    rows = s.scalars(select(Chat).where(Chat.student_id == student_id).options(selectinload(Chat.messages))
                     .order_by(Chat.updated_at.desc()).limit(MAX_CHATS))
    return [_to_dict(c) for c in rows]


def save_chat(s: Session, student_id: str, chat_id: str, title: str, updated_at_ms: int, messages: list[dict]) -> dict:
    """Create or replace one chat, then drop the student's chats beyond the newest MAX_CHATS."""
    chat = s.get(Chat, chat_id)
    if chat and chat.student_id != student_id:
        raise NotYours(chat_id)
    when = _utc(updated_at_ms)
    if not chat:
        chat = Chat(id=chat_id, student_id=student_id, created_at=when)
        s.add(chat)
    chat.title = title
    chat.updated_at = when
    chat.messages.clear()
    s.flush()  # remove the old messages before the new ones take their positions
    chat.messages.extend(ChatMessageRow(position=i, role=str(m.get("role", "")), message=m)
                         for i, m in enumerate(messages[-MAX_MESSAGES:]))
    s.flush()

    old = s.scalars(select(Chat.id).where(Chat.student_id == student_id)
                    .order_by(Chat.updated_at.desc()).offset(MAX_CHATS)).all()
    if old:
        s.execute(delete(ChatMessageRow).where(ChatMessageRow.chat_id.in_(old)))
        s.execute(delete(Chat).where(Chat.id.in_(old)))
    return _to_dict(chat)


def delete_chat(s: Session, student_id: str, chat_id: str) -> bool:
    """Delete one of the student's chats. False if the student has no chat with this id."""
    chat = s.get(Chat, chat_id)
    if not chat or chat.student_id != student_id:
        return False
    s.delete(chat)
    return True
