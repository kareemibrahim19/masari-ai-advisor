"""Checks for the seats per section and the seat requests (ai/db/seat_requests.py, ai/chatbot/seats.py). Run from
the repo root:
    .venv/Scripts/python.exe ai/tests/test_seats.py
Uses a temporary SQLite file and the ai/data files, no database server or network needed. The API part needs FastAPI
and httpx; where they cannot be imported it is skipped (CI runs it).
"""

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "chatbot"))
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402

from db import seat_requests as store  # noqa: E402
from db import source  # noqa: E402
from db.database import make_engine  # noqa: E402
from db.seed import create_and_seed  # noqa: E402

failures = []


def check(name, cond, got=None):
    if not cond:
        failures.append(f"{name}: {got}")
    print(("ok   " if cond else "FAIL ") + name)


source._database = lambda: None  # always the ai/data files, even where .env points at a database

A, B = "883941655", "897948891"  # two of the mock students
sections = source.load("sections.json")["sections"]
offerings = source.load("instructors.json")["offerings"]
check("one seats entry per section in instructors.json (university requirements have none)",
      [(x["course_code"], x["section"], x["offered_term"]) for x in sections]
      == [(o["course_code"], o["section"], o["offered_term"]) for o in offerings if not o["course_code"].startswith("UNR")])
check("seats are sane", all(0 <= x["enrolled"] <= x["capacity"] for x in sections))
check("some sections are full (for the demo)", any(x["enrolled"] == x["capacity"] for x in sections))

tmp = tempfile.TemporaryDirectory()
engine = make_engine(f"sqlite:///{Path(tmp.name, 'seats.db').as_posix()}")
store.create_tables(engine)

with Session(engine) as s:
    made, new = store.request_seat(s, A, "ECE 321", "1", "spring")
    s.commit()
    check("a request is made, pending", new and made["status"] == "pending" and made["section"] == "1", made)
    again, new = store.request_seat(s, A, "ECE 321", "1", "spring")
    check("asking again returns the same request", not new and again["id"] == made["id"], again)
    check("list has it", [r["id"] for r in store.list_requests(s, A)] == [made["id"]])
    check("another student sees none of it", store.list_requests(s, B) == [])
    check("another student cannot withdraw it", not store.cancel_request(s, B, made["id"]))
    check("withdraw own request", store.cancel_request(s, A, made["id"]))
    s.commit()
    check("withdrawn request is gone", store.list_requests(s, A) == [])
    store.request_seat(s, A, "ECE 321", "1", "spring")
    s.commit()

# Reloading the program data (seed --reset) must not wipe the students' requests.
create_and_seed(engine)
create_and_seed(engine, reset=True)
with Session(engine) as s:
    check("seed --reset keeps seat requests", len(store.list_requests(s, A)) == 1)

# ---------------------------------------------------------------- API (needs FastAPI + httpx)
try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    import seats
except ImportError as e:  # e.g. Windows Smart App Control blocks pydantic-core's DLL
    print(f"skip API checks ({e.__class__.__name__}: {str(e).splitlines()[0][:80]})")
else:
    app = FastAPI()
    app.include_router(seats.router)
    Local = sessionmaker(bind=engine)

    def session_override():
        with Local() as s:
            yield s

    app.dependency_overrides[seats.get_session] = session_override
    api = TestClient(app)

    r = api.get("/api/sections")
    body = r.json()
    term = source.load("students.json")["generated_for_term"]["term"]
    check("GET sections answers for this term", r.status_code == 200 and body["term"] == term, r.text[:200])
    now = body["courses"]
    check("only sections offered this term (or both)",
          all(x["offered_term"] in (term, "both") for xs in now.values() for x in xs))
    check("seats_left = capacity - enrolled", all(x["seats_left"] == x["capacity"] - x["enrolled"]
                                                  for xs in now.values() for x in xs))
    check("each section names its instructor", all(x["instructor_id"] for xs in now.values() for x in xs))
    full = next((c, x["section"]) for c, xs in now.items() for x in xs if x["seats_left"] == 0)
    open_ = next((c, x["section"]) for c, xs in now.items() for x in xs if x["seats_left"] > 0)

    url = f"/api/students/{B}/seat-requests"
    r = api.post(url, json={"course_code": full[0], "section": full[1]})
    check("POST a full section makes a request (201)", r.status_code == 201 and r.json()["status"] == "pending", r.text)
    rid = r.json()["id"]
    check("POST it again is the same request (200)", (r2 := api.post(url, json={"course_code": full[0], "section": full[1]}))
          .status_code == 200 and r2.json()["id"] == rid, r2.text)
    check("GET lists it", [x["id"] for x in api.get(url).json()["requests"]] == [rid])
    check("a section with seats is 409", api.post(url, json={"course_code": open_[0], "section": open_[1]}).status_code == 409)
    check("an unknown section is 404", api.post(url, json={"course_code": "XXX 999", "section": "1"}).status_code == 404)
    check("unknown student is 404", api.get("/api/students/000/seat-requests").status_code == 404)
    check("bad body is 422", api.post(url, json={"course_code": full[0]}).status_code == 422)
    check("DELETE withdraws it", api.delete(f"{url}/{rid}").status_code == 200 and api.get(url).json()["requests"] == [])
    check("DELETE again is 404", api.delete(f"{url}/{rid}").status_code == 404)

    broken = sessionmaker(bind=make_engine("sqlite:///Z:/no/such/folder/x.db"))

    def broken_session():
        with broken() as s:
            yield s

    app.dependency_overrides[seats.get_session] = broken_session
    check("database down is 503 for requests", api.get(url).status_code == 503)
    check("sections still answer with the database down", api.get("/api/sections").status_code == 200)

engine.dispose()
print()
if failures:
    print(f"{len(failures)} failed:")
    for f in failures:
        print("  " + f)
    sys.exit(1)
print("All seats checks passed.")
