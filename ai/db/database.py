"""Database connection for the Masari backend.

DATABASE_URL (in .env) picks the database:
  - not set              -> SQLite file ai/masari.db (local development, nothing to install or sign up for)
  - postgresql://...     -> Postgres (Neon / Supabase connection string, used when hosted)

Postgres goes through pg8000, a driver written in pure Python: it needs no compiled DLLs, so it installs the
same on Windows (where Smart App Control blocks compiled drivers), CI and Vercel.
"""

import os
import ssl
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, event, make_url
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

DEFAULT_URL = f"sqlite:///{(ROOT / 'ai' / 'masari.db').as_posix()}"
LOCAL_HOSTS = {None, "", "localhost", "127.0.0.1", "::1"}


def make_engine(url: str | None = None) -> Engine:
    u = make_url(url or os.getenv("DATABASE_URL") or DEFAULT_URL)
    connect_args = {}
    if u.get_backend_name() in ("postgres", "postgresql"):
        # Neon and Supabase hand out postgres:// URLs with libpq options (sslmode, channel_binding) that pg8000
        # does not take: name the driver and turn those options into an SSL context.
        sslmode = u.query.get("sslmode")
        u = u.set(drivername="postgresql+pg8000").difference_update_query(["sslmode", "channel_binding"])
        if sslmode != "disable" and (sslmode or u.host not in LOCAL_HOSTS):
            connect_args["ssl_context"] = ssl.create_default_context()
    return create_engine(u, pool_pre_ping=True, connect_args=connect_args)


@event.listens_for(Engine, "connect")
def _sqlite_foreign_keys(dbapi_conn, _record):
    """SQLite ignores foreign keys unless asked, so turn them on to catch the same errors Postgres would."""
    if type(dbapi_conn).__module__.startswith("sqlite3"):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
