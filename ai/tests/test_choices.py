"""Checks for the saved choices (ai/db/choices.py and the /api/students/{id}/choices endpoints). Run from the repo
root:
    .venv/Scripts/python.exe ai/tests/test_choices.py
Uses a temporary SQLite file, no database server or network needed. The API part needs FastAPI and httpx; where they
cannot be imported it is skipped (CI runs it).
"""

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "chatbot"))
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402

from db import choices as store  # noqa: E402
from db.database import make_engine  # noqa: E402
from db.seed import create_and_seed  # noqa: E402

failures = []


def check(name, cond, got=None):
    if not cond:
        failures.append(f"{name}: {got}")
    print(("ok   " if cond else "FAIL ") + name)


A, B = "883941655", "897948891"  # two of the mock students
CHOICES = {"selected": ["CSE 315", "AIE 311"]}

tmp = tempfile.TemporaryDirectory()
engine = make_engine(f"sqlite:///{Path(tmp.name, 'choices.db').as_posix()}")
store.create_tables(engine)

with Session(engine) as s:
    check("nothing saved yet is None", store.get_choices(s, A) is None)
    saved = store.save_choices(s, A, CHOICES, 1_760_000_000_123)
    s.commit()
    check("saved choices come back as sent", saved == {**CHOICES, "updatedAt": 1_760_000_000_123}, saved)
    check("get returns them", store.get_choices(s, A) == saved, store.get_choices(s, A))
    check("another student sees none of it", store.get_choices(s, B) is None)

    newer = {**CHOICES, "selected": ["CSE 315"]}
    store.save_choices(s, A, newer, 1_760_000_100_000)
    s.commit()
    check("a newer save replaces them", store.get_choices(s, A)["selected"] == ["CSE 315"], store.get_choices(s, A))

    got = store.save_choices(s, A, {**CHOICES, "selected": []}, 1_760_000_050_000)
    s.commit()
    check("an older save (stale device) does not undo a newer one",
          got["selected"] == ["CSE 315"] and store.get_choices(s, A)["selected"] == ["CSE 315"], got)

# Reloading the program data (seed --reset) must not wipe what students saved.
create_and_seed(engine)
create_and_seed(engine, reset=True)
with Session(engine) as s:
    check("seed --reset keeps saved choices", (store.get_choices(s, A) or {}).get("selected") == ["CSE 315"])

# ---------------------------------------------------------------- API (needs FastAPI + httpx)
try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    import student_choices
except ImportError as e:  # e.g. Windows Smart App Control blocks pydantic-core's DLL
    print(f"skip API checks ({e.__class__.__name__}: {str(e).splitlines()[0][:80]})")
else:
    app = FastAPI()
    app.include_router(student_choices.router)
    Local = sessionmaker(bind=engine)

    def session_override():
        with Local() as s:
            yield s

    app.dependency_overrides[student_choices.get_session] = session_override
    api = TestClient(app)
    url = f"/api/students/{B}/choices"

    r = api.get(url)
    check("GET before any save is null", r.status_code == 200 and r.json() == {"choices": None}, r.text)
    body = {**CHOICES, "updatedAt": 1_780_000_000_000}
    r = api.put(url, json=body)
    check("PUT saves them", r.status_code == 200 and r.json()["choices"] == body, r.text)
    r = api.get(url)
    check("GET returns them (as on another device)", r.status_code == 200 and r.json()["choices"] == body, r.text)
    r = api.put(url, json={"selected": [], "prefs": {"pace": 70}, "excluded": ["i4"], "updatedAt": 1_780_000_100_000})
    check("old fields (sliders, hidden instructors) from an old page are dropped", r.status_code == 200
          and r.json()["choices"] == {"selected": [], "updatedAt": 1_780_000_100_000}, r.text)
    check("unknown student is 404", api.get("/api/students/000/choices").status_code == 404)
    check("missing updatedAt is 422", api.put(url, json={"selected": []}).status_code == 422)
    check("too long a code is 400", api.put(url, json={**body, "selected": ["x" * 40]}).status_code == 400)

    # No reachable database: 503, so the page simply keeps its choices until the next refresh.
    broken = sessionmaker(bind=make_engine("sqlite:///Z:/no/such/folder/x.db"))

    def broken_session():
        with broken() as s:
            yield s

    app.dependency_overrides[student_choices.get_session] = broken_session
    check("database down is 503", api.get(url).status_code == 503)

engine.dispose()
print()
if failures:
    print(f"{len(failures)} failed:")
    for f in failures:
        print("  " + f)
    sys.exit(1)
print("All saved choices checks passed.")
