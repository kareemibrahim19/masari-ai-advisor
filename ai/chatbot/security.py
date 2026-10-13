"""Sign-in tokens and request limits, in plain Python (no FastAPI), so they can be checked anywhere.

A token says "this is student X until time T" and is signed with MASARI_AUTH_SECRET (HMAC-SHA256), so the server
can trust it without keeping a list of sessions: "883941655.1792000000.<signature>". Anyone who changes the id or
the time breaks the signature. Changing the secret signs everyone out.
"""

import base64
import hashlib
import hmac
import os
import threading
import time
from collections import deque

SESSION_SECONDS = int(float(os.getenv("MASARI_SESSION_HOURS", "12")) * 3600)


class AuthNotConfigured(Exception):
    """MASARI_AUTH_SECRET is not set (or too short to be safe)."""


def _secret() -> bytes:
    secret = os.getenv("MASARI_AUTH_SECRET", "")
    if len(secret) < 32:
        raise AuthNotConfigured("MASARI_AUTH_SECRET must be set to at least 32 random characters")
    return secret.encode("utf-8")


def _sign(payload: str) -> str:
    mac = hmac.new(_secret(), payload.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode("ascii").rstrip("=")


def make_token(student_id: str, now: float | None = None) -> tuple[str, int]:
    """A token for the student and when it stops working (seconds since 1970)."""
    expires = int(now if now is not None else time.time()) + SESSION_SECONDS
    payload = f"{student_id}.{expires}"
    return f"{payload}.{_sign(payload)}", expires


def read_token(token: str, now: float | None = None) -> str | None:
    """The student id inside a valid, unexpired token, else None."""
    try:
        student_id, expires, signature = token.split(".")
        if int(expires) < (now if now is not None else time.time()):
            return None
    except ValueError:
        return None
    if not hmac.compare_digest(signature, _sign(f"{student_id}.{expires}")):
        return None
    return student_id


class RateLimiter:
    """At most `limit` hits per key in any `window` seconds (a sliding window kept in memory).

    Each server process counts on its own, so on a host that runs several copies (Vercel) the real limit is
    somewhat higher. It is meant to stop a script hammering the endpoint, not to count exactly.
    """

    def __init__(self, limit: int, window: float):
        self.limit, self.window = limit, window
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._next_sweep = 0.0

    def hit(self, key: str, now: float | None = None) -> float:
        """Count one request. Returns 0 if it is allowed, else how many seconds to wait."""
        now = now if now is not None else time.monotonic()
        with self._lock:
            if now >= self._next_sweep:  # forget keys that went quiet, so memory does not grow forever
                self._hits = {k: q for k, q in self._hits.items() if q and q[-1] > now - self.window}
                self._next_sweep = now + self.window
            q = self._hits.setdefault(key, deque())
            while q and q[0] <= now - self.window:
                q.popleft()
            if len(q) >= self.limit:
                return q[0] + self.window - now
            q.append(now)
            return 0

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)
