"""Generate ai/data/sections.json: simulated seats (capacity, enrolled) for every section in instructors.json.

Run from the repo root (it overwrites the file; the same seed always gives the same numbers):
    .venv\\Scripts\\python.exe ai\\scripts\\generate_mock_sections.py

One entry per offering (course_code + section + offered_term). In a course with more than one section, about one
section in five is full, so the "section is full / request a seat" path shows up for the demo students. The two
courses the website used to simulate by hand keep the numbers it showed.
"""

import json
import random
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
SEED = 7

# The website's former hand-written seats (frontend/src/lib/demo-content.ts), kept as they were: (capacity, left).
KNOWN = {("ECE 321", "1"): (45, 0), ("ECE 321", "2"): (45, 8), ("ECE 321", "3"): (40, 19),
         ("CSE 315", "1"): (40, 12), ("CSE 315", "2"): (40, 21)}


def main() -> None:
    rnd = random.Random(SEED)
    offerings = json.loads((DATA / "instructors.json").read_text(encoding="utf-8"))["offerings"]
    per_course = {}
    for o in offerings:
        per_course[(o["course_code"], o["offered_term"])] = per_course.get((o["course_code"], o["offered_term"]), 0) + 1

    sections = []
    for o in offerings:
        if o["course_code"].startswith("UNR"):  # university requirements have no sections
            continue
        key = (o["course_code"], o["section"])
        if key in KNOWN:
            capacity, left = KNOWN[key]
        else:
            capacity = rnd.choice([30, 35, 40, 45])
            several = per_course[(o["course_code"], o["offered_term"])] > 1
            full = several and o["section"] == "1" and rnd.random() < 0.4
            left = 0 if full else rnd.randint(3, capacity // 2)
        sections.append({"course_code": o["course_code"], "section": o["section"], "offered_term": o["offered_term"],
                         "capacity": capacity, "enrolled": capacity - left})

    out = {"_note": "بيانات وهمية لعدد المقاعد في كل سكشن (السعة والمسجلين)، بنفس الشكل اللي هتيجي بيه الداتا الحقيقية.",
           "sections": sections}
    (DATA / "sections.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    full = sum(1 for s in sections if s["enrolled"] >= s["capacity"])
    print(f"sections.json: {len(sections)} sections, {full} full")


if __name__ == "__main__":
    main()
