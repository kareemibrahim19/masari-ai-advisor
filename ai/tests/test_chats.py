"""Checks for the saved recent chats (ai/db/chats.py and the /api/students/{id}/chats endpoints). Run from the
repo root:
    .venv/Scripts/python.exe ai/tests/test_chats.py
Uses a temporary SQLite file, no database server or network needed. The API part needs FastAPI and httpx; where they
cannot be imported it is skipped (CI runs it).
"""

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "chatbot"))
from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402

from db import chats as store  # noqa: E402
from db.database import make_engine  # noqa: E402
from db.models import ChatMessageRow  # noqa: E402
from db.seed import create_and_seed  # noqa: E402

failures = []


def check(name, cond, got=None):
    if not cond:
        failures.append(f"{name}: {got}")
    print(("ok   " if cond else "FAIL ") + name)


A, B = "883941655", "897948891"  # two of the mock students
MSGS = [
    {"id": "m1", "role": "user", "text": "اقدر اسجل كام ساعة؟"},
    {"id": "m2", "role": "assistant", "kind": "ai", "text": "**21 ساعة**", "sources": [{"id": "aie-reg-13-ar", "title": "مادة [13]", "source": "regulation"}],
     "advisorEmail": {"to": "x@example", "subject": "s", "body": "b"}},
]

tmp = tempfile.TemporaryDirectory()
engine = make_engine(f"sqlite:///{Path(tmp.name, 'chats.db').as_posix()}")
store.create_tables(engine)

with Session(engine) as s:
    saved = store.save_chat(s, A, "c1", "اقدر اسجل", 1_760_000_000_123, MSGS)
    s.commit()
    check("saved chat comes back as sent", saved == {"id": "c1", "title": "اقدر اسجل", "updatedAt": 1_760_000_000_123,
                                                     "messages": MSGS}, saved)
    check("list has the chat with its messages", store.list_chats(s, A) == [saved], store.list_chats(s, A))
    check("another student sees none of it", store.list_chats(s, B) == [])

    # Saving again replaces the messages (the website sends the whole chat after each answer).
    store.save_chat(s, A, "c1", "اقدر اسجل", 1_760_000_100_000, MSGS + [{"id": "m3", "role": "user", "text": "و الصيفي؟"}])
    s.commit()
    got = store.list_chats(s, A)
    check("save again replaces the messages", len(got) == 1 and len(got[0]["messages"]) == 3, got)

    try:
        store.save_chat(s, B, "c1", "hijack", 1_760_000_200_000, [])
        check("a student cannot overwrite another's chat", False, "saved")
    except store.NotYours:
        s.rollback()
        check("a student cannot overwrite another's chat", store.list_chats(s, A)[0]["title"] == "اقدر اسجل")

    check("a student cannot delete another's chat", not store.delete_chat(s, B, "c1"))
    check("delete an unknown chat is False", not store.delete_chat(s, A, "nope"))

    # Newest first, and only the newest MAX_CHATS are kept.
    for i in range(store.MAX_CHATS + 3):
        store.save_chat(s, A, f"n{i}", f"chat {i}", 1_770_000_000_000 + i * 1000, MSGS[:1])
    s.commit()
    got = store.list_chats(s, A)
    check(f"keeps the newest {store.MAX_CHATS}", len(got) == store.MAX_CHATS and got[0]["id"] == f"n{store.MAX_CHATS + 2}"
          and "c1" not in {c["id"] for c in got}, [c["id"] for c in got])
    check("old chats' messages are removed too",
          s.execute(select(ChatMessageRow).where(ChatMessageRow.chat_id == "c1")).first() is None)

    check("delete own chat", store.delete_chat(s, A, "n5"))
    s.commit()
    check("deleted chat is gone", "n5" not in {c["id"] for c in store.list_chats(s, A)})

# Reloading the program data (seed --reset) must not wipe what students saved.
create_and_seed(engine)
create_and_seed(engine, reset=True)
with Session(engine) as s:
    check("seed --reset keeps saved chats", len(store.list_chats(s, A)) == store.MAX_CHATS - 1)

# ---------------------------------------------------------------- API (needs FastAPI + httpx)
try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    import chat_history
except ImportError as e:  # e.g. Windows Smart App Control blocks pydantic-core's DLL
    print(f"skip API checks ({e.__class__.__name__}: {str(e).splitlines()[0][:80]})")
else:
    app = FastAPI()
    app.include_router(chat_history.router)
    Local = sessionmaker(bind=engine)

    def session_override():
        with Local() as s:
            yield s

    app.dependency_overrides[chat_history.get_session] = session_override
    api = TestClient(app)

    body = {"title": "سؤال", "updatedAt": 1_780_000_000_000, "messages": MSGS}
    r = api.put(f"/api/students/{B}/chats/web-1", json=body)
    check("PUT saves a chat", r.status_code == 200 and r.json()["messages"] == MSGS, r.text)
    r = api.get(f"/api/students/{B}/chats")
    check("GET lists it (as on another device)", r.status_code == 200 and [c["id"] for c in r.json()["chats"]] == ["web-1"], r.text)
    check("unknown student is 404", api.get("/api/students/000/chats").status_code == 404)
    check("PUT another student's chat id is 404", api.put(f"/api/students/{A}/chats/web-1", json=body).status_code == 404)
    check("bad body is 422", api.put(f"/api/students/{B}/chats/web-2", json={"title": "x"}).status_code == 422)
    check("DELETE removes it", api.delete(f"/api/students/{B}/chats/web-1").status_code == 200
          and api.get(f"/api/students/{B}/chats").json()["chats"] == [])
    check("DELETE again is 404", api.delete(f"/api/students/{B}/chats/web-1").status_code == 404)

    # No reachable database: 503, so the website keeps the chats in the browser.
    broken = sessionmaker(bind=make_engine("sqlite:///Z:/no/such/folder/x.db"))

    def broken_session():
        with broken() as s:
            yield s

    app.dependency_overrides[chat_history.get_session] = broken_session
    check("database down is 503", api.get(f"/api/students/{B}/chats").status_code == 503)

engine.dispose()
print()
if failures:
    print(f"{len(failures)} failed:")
    for f in failures:
        print("  " + f)
    sys.exit(1)
print("All chat history checks passed.")
