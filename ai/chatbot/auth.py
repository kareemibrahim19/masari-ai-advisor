"""Signing in with a password, and keeping each student's data to that student.

    POST /api/auth/login   {"student_id": "...", "password": "..."}  ->  {"token", "expires_at", "student"}
    GET  /api/auth/me      who the token belongs to

The website sends the token back on every request as "Authorization: Bearer <token>". Passwords are set with
ai/db/accounts.py. Settings (environment / .env):

    MASARI_AUTH_SECRET    at least 32 random characters; signs the tokens (required for signing in)
    MASARI_REQUIRE_AUTH   "1" turns the protection on. Until then every endpoint still answers without a token,
                          so the website keeps working while it moves to the password sign-in.
    MASARI_SESSION_HOURS  how long a sign-in lasts (default 12)

With MASARI_REQUIRE_AUTH=1 a student's endpoints answer 401 without a valid token and 403 for another student's
id, and the chat and microphone need a signed-in student.
"""

import os
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import security  # noqa: E402
import students  # noqa: E402
from db import accounts  # noqa: E402
from db.database import SessionLocal  # noqa: E402

router = APIRouter()
_tables_ready = set()

# Guessing passwords: a few tries per student, and a few more per address (one address may try many students).
login_per_student = security.RateLimiter(limit=5, window=15 * 60)
login_per_address = security.RateLimiter(limit=20, window=15 * 60)


def required() -> bool:
    return os.getenv("MASARI_REQUIRE_AUTH", "").strip().lower() in ("1", "true", "yes")


def client_address(request: Request) -> str:
    # Behind Vercel the caller's address is the first one in X-Forwarded-For (Vercel sets it).
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else "unknown")


def signed_in(request: Request) -> str | None:
    """The student id of a valid token in the request, else None."""
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    try:
        return security.read_token(token.strip())
    except security.AuthNotConfigured:
        return None


def check(request: Request, student_id: str | None = None) -> None:
    """With protection on: a signed-in student is needed, and it must be the one whose data is asked for."""
    if not required():
        return
    who = signed_in(request)
    if not who:
        raise HTTPException(401, "Sign in required", headers={"WWW-Authenticate": "Bearer"})
    if student_id is not None and student_id != who:
        raise HTTPException(403, "This is another student's data")


def own_student(student_id: str, request: Request) -> str:
    """Dependency for /api/students/{student_id}/...: the caller's own id, and a student that exists."""
    check(request, student_id)
    if not students.get_student(student_id):
        raise HTTPException(404, "Student not found")
    return student_id


def get_session():
    with SessionLocal() as s:
        yield s


def _too_many(wait: float):
    raise HTTPException(429, "Too many tries. Wait a few minutes and try again.",
                        headers={"Retry-After": str(int(wait) + 1)})


class LoginBody(BaseModel):
    student_id: str = Field(min_length=1, max_length=16)
    password: str = Field(min_length=1, max_length=200)


@router.post("/api/auth/login")
def login(body: LoginBody, request: Request, s: Session = Depends(get_session)):
    sid = body.student_id.strip()
    for limiter, key in ((login_per_address, client_address(request)), (login_per_student, sid)):
        if wait := limiter.hit(key):
            _too_many(wait)
    try:
        bind = s.get_bind()
        if bind.url not in _tables_ready:
            accounts.create_tables(bind)
            _tables_ready.add(bind.url)
        ok = accounts.check_password(s, sid, body.password)
    except SQLAlchemyError as e:
        raise HTTPException(503, "Sign-in is not available right now") from e
    student = students.get_student(sid) if ok else None
    if not student:  # one answer for a wrong id and a wrong password
        raise HTTPException(401, "Wrong student ID or password")
    login_per_student.reset(sid)
    try:
        token, expires = security.make_token(sid)
    except security.AuthNotConfigured as e:
        raise HTTPException(503, "Sign-in is not set up on the server") from e
    return {"token": token, "expires_at": expires, "student": student}


@router.get("/api/auth/me")
def me(request: Request):
    who = signed_in(request)
    if not who:
        raise HTTPException(401, "Not signed in", headers={"WWW-Authenticate": "Bearer"})
    return {"student_id": who}
