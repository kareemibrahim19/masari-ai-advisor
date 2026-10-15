"""Checks for the password sign-in (ai/db/accounts.py, ai/chatbot/security.py, ai/chatbot/auth.py). Run from the
repo root:
    .venv/Scripts/python.exe ai/tests/test_auth.py
Uses a temporary SQLite file, no database server or network needed. The API part needs FastAPI and httpx; where they
cannot be imported it is skipped (CI runs it).
"""

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "chatbot"))
os.environ["MASARI_AUTH_SECRET"] = "test-secret-" + "x" * 32
os.environ.pop("MASARI_REQUIRE_AUTH", None)

from sqlalchemy.orm import Session, sessionmaker  # noqa: E402

import security  # noqa: E402
from db import accounts  # noqa: E402
from db.database import make_engine  # noqa: E402
from db.seed import create_and_seed  # noqa: E402

failures = []


def check(name, cond, got=None):
    if not cond:
        failures.append(f"{name}: {got}")
    print(("ok   " if cond else "FAIL ") + name)


A, B = "883941655", "897948891"  # two of the mock students
PASSWORD = "correct horse 7"

# ---------------------------------------------------------------- password hashes
h = accounts.hash_password(PASSWORD, iterations=1000)
check("hash does not contain the password", PASSWORD not in h and h.startswith("pbkdf2_sha256$1000$"), h)
check("right password verifies", accounts.verify_password(PASSWORD, h))
check("wrong password does not", not accounts.verify_password(PASSWORD + "!", h))
check("same password, different salt", accounts.hash_password(PASSWORD, 1000) != h)
check("broken hash is just False", not accounts.verify_password(PASSWORD, "garbage")
      and not accounts.verify_password(PASSWORD, "md5$1$a$b"))

# ---------------------------------------------------------------- accounts table
tmp = tempfile.TemporaryDirectory()
engine = make_engine(f"sqlite:///{Path(tmp.name, 'auth.db').as_posix()}")
accounts.create_tables(engine)
with Session(engine) as s:
    accounts.set_password(s, A, PASSWORD)
    s.commit()
    check("sign in with the right password", accounts.check_password(s, A, PASSWORD))
    check("wrong password refused", not accounts.check_password(s, A, "wrong password"))
    check("student without a password refused", not accounts.check_password(s, B, PASSWORD))
    try:
        accounts.set_password(s, B, "short")
        check("too short a password refused", False, "set")
    except ValueError:
        check("too short a password refused", True)
    accounts.set_password(s, A, "a new password")
    s.commit()
    check("changing the password replaces the old one", accounts.check_password(s, A, "a new password")
          and not accounts.check_password(s, A, PASSWORD))
    check("list of students with a password", accounts.with_password(s) == {A})

create_and_seed(engine)
create_and_seed(engine, reset=True)
with Session(engine) as s:
    check("seed --reset keeps passwords", accounts.check_password(s, A, "a new password"))

# ---------------------------------------------------------------- tokens
token, expires = security.make_token(A, now=1_000_000)
check("token reads back as the student", security.read_token(token, now=1_000_100) == A, token)
check("token expires", security.read_token(token, now=expires + 1) is None)
sid, exp, sig = token.split(".")
check("changed id breaks the token", security.read_token(f"{B}.{exp}.{sig}", now=1_000_100) is None)
check("longer time breaks the token", security.read_token(f"{sid}.{int(exp) + 9999}.{sig}", now=1_000_100) is None)
check("garbage is not a token", security.read_token("abc", now=0) is None and security.read_token("", now=0) is None)
saved = os.environ["MASARI_AUTH_SECRET"]
os.environ["MASARI_AUTH_SECRET"] = "another-secret-" + "y" * 32
check("another secret does not accept it", security.read_token(token, now=1_000_100) is None)
os.environ["MASARI_AUTH_SECRET"] = "short"
try:
    security.make_token(A)
    check("a short secret is refused", False, "made")
except security.AuthNotConfigured:
    check("a short secret is refused", True)
os.environ["MASARI_AUTH_SECRET"] = saved

# ---------------------------------------------------------------- rate limits
lim = security.RateLimiter(limit=3, window=60)
check("first hits allowed", [lim.hit("k", now=t) for t in (0, 1, 2)] == [0, 0, 0])
wait = lim.hit("k", now=3)
check("the next one waits until the first leaves the window", wait == 57, wait)
check("another key has its own count", lim.hit("other", now=3) == 0)
check("allowed again after the window", lim.hit("k", now=61) == 0)
lim.reset("k")
check("reset clears the count", all(lim.hit("k", now=62) == 0 for _ in range(3)))

# ---------------------------------------------------------------- API (needs FastAPI + httpx)
try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    import auth
    import chat_history
    import student_choices
    import seats
except ImportError as e:  # e.g. Windows Smart App Control blocks pydantic-core's DLL
    print(f"skip API checks ({e.__class__.__name__}: {str(e).splitlines()[0][:80]})")
else:
    app = FastAPI()
    app.include_router(auth.router)
    app.include_router(chat_history.router)
    app.include_router(student_choices.router)
    app.include_router(seats.router)
    Local = sessionmaker(bind=engine)

    def session_override():
        with Local() as s:
            yield s

    app.dependency_overrides[auth.get_session] = session_override
    app.dependency_overrides[chat_history.get_session] = session_override
    app.dependency_overrides[student_choices.get_session] = session_override
    app.dependency_overrides[seats.get_session] = session_override
    api = TestClient(app)

    r = api.post("/api/auth/login", json={"student_id": A, "password": "a new password"})
    check("login gives a token and the student", r.status_code == 200 and r.json()["student"]["student_id"] == A
          and security.read_token(r.json()["token"]) == A, r.text)
    mine = {"Authorization": f"Bearer {r.json()['token']}"}
    check("me says who it is", api.get("/api/auth/me", headers=mine).json() == {"student_id": A})
    check("me without a token is 401", api.get("/api/auth/me").status_code == 401)
    r = api.post("/api/auth/login", json={"student_id": A, "password": "wrong password"})
    check("wrong password is 401", r.status_code == 401, r.text)
    r = api.post("/api/auth/login", json={"student_id": B, "password": "a new password"})
    check("student with no password is the same 401", r.status_code == 401 and r.json()["detail"] ==
          "Wrong student ID or password", r.text)

    # Protection off (the default): everything answers as before, with or without a token.
    check("off: chats without a token", api.get(f"/api/students/{B}/chats").status_code == 200)

    os.environ["MASARI_REQUIRE_AUTH"] = "1"
    check("on: chats without a token is 401", api.get(f"/api/students/{A}/chats").status_code == 401)
    check("on: own chats with the token", api.get(f"/api/students/{A}/chats", headers=mine).status_code == 200)
    check("on: another student's chats is 403", api.get(f"/api/students/{B}/chats", headers=mine).status_code == 403)
    check("on: a forged token is 401", api.get(f"/api/students/{A}/chats",
                                              headers={"Authorization": f"Bearer {A}.9999999999.forged"}).status_code == 401)
    check("on: choices without a token is 401", api.get(f"/api/students/{A}/choices").status_code == 401)
    check("on: own choices with the token", api.get(f"/api/students/{A}/choices", headers=mine).status_code == 200)
    check("on: saving another student's choices is 403", api.put(
        f"/api/students/{B}/choices", json={"selected": [], "updatedAt": 1}, headers=mine).status_code == 403)
    check("on: seat requests without a token is 401", api.get(f"/api/students/{A}/seat-requests").status_code == 401)
    check("on: own seat requests with the token",
          api.get(f"/api/students/{A}/seat-requests", headers=mine).status_code == 200)
    check("on: another student's seat requests is 403",
          api.get(f"/api/students/{B}/seat-requests", headers=mine).status_code == 403)
    check("on: the seats per section stay open", api.get("/api/sections").status_code == 200)
    os.environ.pop("MASARI_REQUIRE_AUTH")

    # Guessing: after 5 wrong tries the student is locked for a while, even with the right password.
    auth.login_per_student.reset(A)
    codes = [api.post("/api/auth/login", json={"student_id": A, "password": f"guess {i}"}).status_code for i in range(5)]
    r = api.post("/api/auth/login", json={"student_id": A, "password": "a new password"})
    check("6th try is 429", codes == [401] * 5 and r.status_code == 429 and "retry-after" in r.headers, (codes, r.status_code))

engine.dispose()
print()
if failures:
    print(f"{len(failures)} failed:")
    for f in failures:
        print("  " + f)
    sys.exit(1)
print("All sign-in checks passed.")
