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

r = c.get("/api/instructors/courses").json()
check("course list has ECE 321", any(x["code"] == "ECE 321" and x["sections"] == 3 for x in r["courses"]))

r = c.get("/api/instructors/recommend", params={"course_code": "ECE 321", "student_id": NEW}).json()
check("first-year student -> surveys_only", r["basis"] == "surveys_only" and r["basis_en"], r.get("basis"))
check("ranking has english reasons", all("reasons_en" in x for x in r["ranking"]))

r = c.get("/api/instructors/recommend", params={"course_code": "ECE 321", "student_id": NEW,
                                                 "pace": 85, "workload": 85, "practical": 85}).json()
check("stated preferences change the basis and the winner", r["basis"] == "surveys_and_preferences"
      and r["ranking"][0]["instructor_id"] == "i2", r.get("basis"))

r = c.get("/api/instructors/recommend", params={"course_code": "ECE 321", "student_id": EXC}).json()
check("student with grades -> performance", r["basis"] == "surveys_and_performance", r.get("basis"))

check("unknown student 404", c.get("/api/instructors/recommend", params={"course_code": "ECE 321", "student_id": "x"}).status_code == 404)
check("unknown course 404", c.get("/api/instructors/recommend", params={"course_code": "XXX 999", "student_id": NEW}).status_code == 404)

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
