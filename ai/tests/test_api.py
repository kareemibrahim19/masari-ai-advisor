"""Checks for the page endpoints (no Gemini call is made). Run from the repo root:
    .venv/Scripts/python.exe ai/tests/test_api.py
Needs GEMINI_API_KEY in .env only because the server builds its search index when it starts.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "chatbot"))
from fastapi.testclient import TestClient  # noqa: E402
from server import app  # noqa: E402

c = TestClient(app)
failures = []


def check(name, cond, got=None):
    if not cond:
        failures.append(f"{name}: {got}")
    print(("ok   " if cond else "FAIL ") + name)


NEW, EXC = "833603614", "883941655"

r = c.get("/api/teaching-assistants", params={"student_id": NEW}).json()
check("first-year student sees BAS 011, BAS 021 and BAS 031 with two assistants each",
      [x["code"] for x in r["courses"]] == ["BAS 011", "BAS 021", "BAS 031"] and all(len(x["assistants"]) == 2 for x in r["courses"]), r)
r = c.get("/api/teaching-assistants", params={"student_id": "839263318"}).json()
check("final-year student: no recommendations", r["courses"] == [], r)
check("unknown student 404", c.get("/api/teaching-assistants", params={"student_id": "x"}).status_code == 404)
check("doctor ranking endpoint is gone", c.get("/api/instructors/recommend", params={"course_code": "ECE 321", "student_id": NEW}).status_code == 404)

r = c.post("/api/tools/credit_limit", json={"student_id": "897948891"}).json()
check("generic tool endpoint", r["max_credits"] == 12, r)
check("unknown tool 404", c.post("/api/tools/nope", json={}).status_code == 404)

# CORS: both site domains are allowed, a stranger is not
for origin, ok in (("https://masari-web-sigma.vercel.app", True), ("https://masari-ai-advisor.vercel.app", False),
                   ("https://evil.example.com", False)):
    h = c.options("/api/chat", headers={"Origin": origin, "Access-Control-Request-Method": "POST",
                                        "Access-Control-Request-Headers": "content-type"})
    check(f"CORS {origin} {'allowed' if ok else 'blocked'}", (h.status_code == 200) == ok, h.status_code)

print(f"\n{len(failures)} failure(s)")
sys.exit(1 if failures else 0)
