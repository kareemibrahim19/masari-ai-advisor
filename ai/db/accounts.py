"""Student passwords for signing in (POST /api/auth/login in ai/chatbot/auth.py). A student with none yet sets
their own from the website's /activate page (POST /api/auth/activate); the commands below are for the admin.

A password is never stored, only a salted PBKDF2-SHA256 hash ("pbkdf2_sha256$<iterations>$<salt>$<hash>"), made
with Python's own hashlib so nothing compiled has to be installed. Run from the repo root:

    .venv\\Scripts\\python.exe ai\\db\\accounts.py set 883941655   set (or change) one student's password
    .venv\\Scripts\\python.exe ai\\db\\accounts.py demo            one password for every student who has none yet
    .venv\\Scripts\\python.exe ai\\db\\accounts.py list            which students have a password
    .venv\\Scripts\\python.exe ai\\db\\accounts.py reset 883941655 remove one student's password (they activate again)

The password is typed at a hidden prompt, so it never lands in the shell history. The database is DATABASE_URL
(see database.py), the same one the AI service uses.
"""

import argparse
import base64
import getpass
import hashlib
import hmac
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db.models import Account  # noqa: E402

ALGORITHM = "pbkdf2_sha256"
ITERATIONS = 300_000  # about a tenth of a second per check: cheap for one sign-in, slow for guessing
MIN_LENGTH = 8


def create_tables(engine: Engine) -> None:
    Account.__table__.create(engine, checkfirst=True)


def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")


def hash_password(password: str, iterations: int = ITERATIONS) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"{ALGORITHM}${iterations}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt, digest = stored.split("$")
        if algorithm != ALGORITHM:
            return False
        got = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), base64.b64decode(salt), int(iterations))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(got, base64.b64decode(digest))


# Checked against when the student has no account, so a wrong id takes as long as a wrong password.
_DUMMY_HASH = hash_password(secrets.token_hex(8))


def check_password(s: Session, student_id: str, password: str) -> bool:
    """True if the student has a password and this is it."""
    account = s.get(Account, student_id)
    ok = verify_password(password, account.password_hash if account else _DUMMY_HASH)
    return ok and account is not None


def set_password(s: Session, student_id: str, password: str) -> None:
    if len(password) < MIN_LENGTH:
        raise ValueError(f"The password must be at least {MIN_LENGTH} characters")
    account = s.get(Account, student_id) or Account(student_id=student_id)
    account.password_hash = hash_password(password)
    account.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    s.add(account)


def has_password(s: Session, student_id: str) -> bool:
    return s.get(Account, student_id) is not None


def remove_password(s: Session, student_id: str) -> bool:
    """Deletes the student's password (they set a new one from /activate). False if they had none."""
    account = s.get(Account, student_id)
    if account is None:
        return False
    s.delete(account)
    return True


def with_password(s: Session) -> set[str]:
    return set(s.scalars(select(Account.student_id)))


def _ask_password() -> str:
    first = getpass.getpass(f"New password (at least {MIN_LENGTH} characters): ")
    if getpass.getpass("Again: ") != first:
        raise SystemExit("The two passwords are not the same.")
    if len(first) < MIN_LENGTH:
        raise SystemExit(f"Too short: at least {MIN_LENGTH} characters.")
    return first


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("set", help="set one student's password").add_argument("student_id")
    sub.add_parser("demo", help="one password for every student who has none yet")
    sub.add_parser("list", help="which students have a password")
    sub.add_parser("reset", help="remove one student's password, so they activate again").add_argument("student_id")
    args = parser.parse_args()

    from db import source
    from db.database import engine
    print(f"Database: {engine.url.render_as_string(hide_password=True)}")
    create_tables(engine)
    students = {st["student_id"]: st["personal"]["name_en"] for st in source.load("students.json")["students"]}

    with Session(engine) as s, s.begin():
        has = with_password(s)
        if args.command == "list":
            for sid, name in students.items():
                print(f"  {sid}  {'yes' if sid in has else 'no ':<4} {name}")
        elif args.command == "reset":
            if not remove_password(s, args.student_id):
                raise SystemExit(f"{args.student_id} has no password.")
            print(f"Password removed for {args.student_id}. They can set a new one from the /activate page.")
        elif args.command == "set":
            if args.student_id not in students:
                raise SystemExit(f"No student with id {args.student_id}.")
            set_password(s, args.student_id, _ask_password())
            print(f"Password set for {args.student_id} ({students[args.student_id]}).")
        else:
            todo = [sid for sid in students if sid not in has]
            if not todo:
                raise SystemExit("Every student already has a password.")
            password = _ask_password()
            for sid in todo:
                set_password(s, sid, password)
            print(f"Password set for {len(todo)} student(s): {', '.join(todo)}")
