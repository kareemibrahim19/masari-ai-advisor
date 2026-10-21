"""Signing in with a password, and keeping each student's data to that student.

    POST /api/auth/login   {"student_id": "...", "password": "..."}  ->  {"token", "expires_at", "student"}
                           409 "Not activated" for a student with no password yet (the website opens /activate)
    GET  /api/auth/me      who the token belongs to

A student with no password yet sets one themself, in two steps (the website's /activate page):

    POST /api/auth/activate/check  {"student_id", "national_id"}  ->  {"activation_token", "expires_at", "name_ar", "name_en"}
    POST /api/auth/activate        {"activation_token", "password"}  ->  same answer as login

The check only passes while the student has no password, so it can never be used to replace someone's password
(an admin removes one with `ai/db/accounts.py reset <id>`, after which the student activates again). Every failed check
gets the same answer, so it does not tell whether the id, the national ID, or an existing password was the reason.

The website sends the token back on every request as "Authorization: Bearer <token>". Passwords are set with
ai/db/accounts.py. Settings (environment / .env):

    MASARI_AUTH_SECRET    at least 32 random characters; signs the tokens (required for signing in)
    MASARI_REQUIRE_AUTH   "1" turns the protection on. Until then every endpoint still answers without a token,
                          so the website keeps working while it moves to the password sign-in.
    MASARI_SESSION_HOURS  how long a sign-in lasts (default 12)

With MASARI_REQUIRE_AUTH=1 a student's endpoints answer 401 without a valid token and 403 for another student's
id, and the chat and microphone need a signed-in student.
"""

import hmac
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
activate_per_student = security.RateLimiter(limit=5, window=15 * 60)

ACTIVATE = "activate"  # the purpose signed into an activation token
ACTIVATE_SECONDS = 10 * 60  # time to choose the password after the national ID was accepted
NOT_ACTIVATED = "Not activated"  # login's answer for a student with no password yet


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
        _ensure_tables(s)
        ok = accounts.check_password(s, sid, body.password)
        first_time = not ok and not accounts.has_password(s, sid)
    except SQLAlchemyError as e:
        raise HTTPException(503, "Sign-in is not available right now") from e
    student = students.get_student(sid) if ok or first_time else None
    if student and first_time:  # a real student who never set a password: the website sends them to activate
        raise HTTPException(409, NOT_ACTIVATED)
    if not student:  # one answer for a wrong id and a wrong password
        raise HTTPException(401, "Wrong student ID or password")
    login_per_student.reset(sid)
    return _session_for(sid, student)


def _ensure_tables(s: Session) -> None:
    bind = s.get_bind()
    if bind.url not in _tables_ready:
        accounts.create_tables(bind)
        _tables_ready.add(bind.url)


def _session_for(sid: str, student: dict) -> dict:
    try:
        token, expires = security.make_token(sid)
    except security.AuthNotConfigured as e:
        raise HTTPException(503, "Sign-in is not set up on the server") from e
    return {"token": token, "expires_at": expires, "student": student}


class ActivateCheckBody(BaseModel):
    student_id: str = Field(min_length=1, max_length=16)
    national_id: str = Field(min_length=1, max_length=32)


class ActivateBody(BaseModel):
    activation_token: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=200)


@router.post("/api/auth/activate/check")
def activate_check(body: ActivateCheckBody, request: Request, s: Session = Depends(get_session)):
    sid, nid = body.student_id.strip(), body.national_id.strip()
    for limiter, key in ((login_per_address, client_address(request)), (activate_per_student, sid)):
        if wait := limiter.hit(key):
            _too_many(wait)
    student = students.get_student(sid)
    on_file = str((student or {}).get("personal", {}).get("national_id") or "")
    matches = bool(on_file) and hmac.compare_digest(nid.encode("utf-8"), on_file.encode("utf-8"))
    try:
        _ensure_tables(s)
        has_password = accounts.has_password(s, sid)
    except SQLAlchemyError as e:
        raise HTTPException(503, "Activation is not available right now") from e
    if not matches or has_password:  # one answer for every reason
        raise HTTPException(401, "These details do not match, or the account is already active")
    activate_per_student.reset(sid)
    try:
        token, expires = security.make_token(sid, purpose=ACTIVATE, seconds=ACTIVATE_SECONDS)
    except security.AuthNotConfigured as e:
        raise HTTPException(503, "Sign-in is not set up on the server") from e
    personal = student["personal"]
    return {"activation_token": token, "expires_at": expires,
            "name_ar": personal["name_ar"], "name_en": personal["name_en"]}


@router.post("/api/auth/activate")
def activate(body: ActivateBody, s: Session = Depends(get_session)):
    try:
        sid = security.read_token(body.activation_token.strip(), purpose=ACTIVATE)
    except security.AuthNotConfigured as e:
        raise HTTPException(503, "Sign-in is not set up on the server") from e
    student = students.get_student(sid) if sid else None
    if not student:
        raise HTTPException(401, "The activation has expired. Start again.")
    if len(body.password) < accounts.MIN_LENGTH:
        raise HTTPException(422, f"The password must be at least {accounts.MIN_LENGTH} characters")
    try:
        _ensure_tables(s)
        if accounts.has_password(s, sid):  # activated in another tab meanwhile
            raise HTTPException(409, "The account is already active. Sign in instead.")
        accounts.set_password(s, sid, body.password)
        s.commit()
    except SQLAlchemyError as e:
        raise HTTPException(503, "Activation is not available right now") from e
    return _session_for(sid, student)


@router.get("/api/auth/me")
def me(request: Request):
    who = signed_in(request)
    if not who:
        raise HTTPException(401, "Not signed in", headers={"WWW-Authenticate": "Bearer"})
    return {"student_id": who}
