"""Add (or replace) one real team member in ai/data/real_students.json, from a short file typed from their MyU pages.

    .venv\\Scripts\\python.exe ai\\scripts\\add_real_student.py path\\to\\student.json

Only what MyU shows is real: name, student code, every course with its marks, total and grade, and each term's
summary. Everything else is left empty (contact, national id, guardian, previous school) or taken from the mock data:
the instructor of each past course is the one who taught that course that year in instructor_grades.json, and the
academic advisor is one of the mock advisors. Course names and credits come from courses.json.

real_students.json is in .gitignore: it stays on the machine that runs ai/db/seed.py --reset, which copies it
into the database the website reads. Without the file everything works with the mock students only.

The input file:
{
  "student_id": "8xxxxxxxx", "name_ar": "...", "name_en": "...", "gender": "ذكر", "enrollment_year": "2023-2024",
  "terms": [
    {"academic_year": "2023-2024", "term": "fall",
     "courses": [["BAS 011", 92, "A-", {"midterm": 16, "coursework": 28, "final": 48}], ...],
     "summary": {"registered_hours": 17, "earned_hours": 17, "term_gpa": 3.89, "cumulative_gpa": 3.89}},
    ...
    {"academic_year": "2026-2027", "term": "fall", "status": "in_progress", "courses": ["ECE 332", ...]}
  ]
}
The script checks every term against its MyU summary (hours and GPA recomputed from the grades), so a typo in a
grade stops it instead of landing in the data.
"""

import json
import random
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
OUT = DATA / "real_students.json"
TERM_AR = {"fall": "الأول", "spring": "الثاني", "summer": "الصيفي"}
GRADE_AR = {"A+": "أ+", "A": "أ", "A-": "أ-", "B+": "ب+", "B": "ب", "B-": "ب-", "C+": "ج+", "C": "ج", "C-": "ج-",
            "D+": "د+", "D": "د", "F": "هـ", "P": "ناجح"}
NOTE = ("Real students: members of the Masari team who agreed to share their MyU records for testing. Only the name, "
        "student code, grades and term summaries are real; instructors and advisors come from the mock data. "
        "Added with ai/scripts/add_real_student.py. ai/db/source.py and ai/db/seed.py load these next to students.json.")


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def build(src: dict) -> tuple[dict, str, list[dict]]:
    courses = {c["code"]: c for c in load("courses.json")["courses"]}
    rules = load("courses.json")["rules"]
    gp = rules["grade_points"]
    records = load("instructor_grades.json")["records"]
    offerings = load("instructors.json")["offerings"]
    sid = src["student_id"]

    terms, history, problems = [], [], []
    passed: dict[str, dict] = {}
    cum_hours = cum_points = cum_earned = 0.0
    main_done = 0
    for t in src["terms"]:
        status = t.get("status", "published")
        row = {"academic_year": t["academic_year"], "term": t["term"], "term_ar": TERM_AR[t["term"]], "status": status,
               "courses": []}
        if status != "published":
            for code in t["courses"]:
                c = courses[code]
                row["courses"].append({"code": code, "name_ar": c["name_ar"], "name_en": c["name_en"],
                                       "credits": c["credits"], "attempt": 1})
            terms.append(row)
            continue

        reg = earned = hours = points = 0.0
        for code, total, grade, *rest in t["courses"]:
            c = courses[code]
            entry = {"code": code, "name_ar": c["name_ar"], "name_en": c["name_en"], "credits": c["credits"],
                     "attempt": 1, "marks": rest[0] if rest else {}, "total": total, "grade": grade,
                     "grade_ar": GRADE_AR[grade]}
            if total is None:  # not on the screenshots (a passed training): left out, as the export leaves it out
                del entry["total"]
            row["courses"].append(entry)
            reg += c["credits"]
            if grade not in ("F",):
                earned += c["credits"]
                passed[code] = c
            if grade in gp and c.get("graded", True):
                hours += c["credits"]
                points += gp[grade] * c["credits"]
            # The instructor who taught this course that year in the mock grade sheets (none for trainings).
            who = next((r["instructor_id"] for r in records
                        if r["course_code"] == code and r["academic_year"] == t["academic_year"]), None)
            if who and c["type"] not in ("training", "project"):
                sec = next((o["section"] for o in offerings if o["course_code"] == code and o["instructor_id"] == who),
                           next((o["section"] for o in offerings if o["course_code"] == code), "1"))
                history.append({"student_id": sid, "course_code": code, "academic_year": t["academic_year"],
                                "term": t["term"], "attempt": 1, "instructor_id": who, "section": sec,
                                "grade": grade, "total": total})
        cum_hours += hours
        cum_points += points
        cum_earned += earned
        if t["term"] != "summer":
            main_done += 1

        s = t["summary"]
        term_gpa = round(points / hours, 2) if hours else None
        cgpa = round(cum_points / cum_hours, 2) if cum_hours else None
        label = f"{t['academic_year']} {t['term']}"
        for name, mine, theirs in (("registered hours", reg, s["registered_hours"]),
                                   ("earned hours", earned, s["earned_hours"]),
                                   ("term GPA", term_gpa, s.get("term_gpa")),
                                   ("cumulative GPA", cgpa, s["cumulative_gpa"])):
            if mine is not None and theirs is not None and abs(mine - theirs) > 0.011:
                problems.append(f"{label}: {name} from the grades is {mine}, MyU says {theirs}")
        row["summary"] = {"registered_hours": int(reg), "earned_hours": int(earned), "term_gpa": s.get("term_gpa"),
                          "cumulative_gpa": s["cumulative_gpa"], "cumulative_earned_hours": int(cum_earned)}
        if t["term"] != "summer":  # MyU gives no standing for a summer term
            row["summary"]["academic_standing"] = s.get("academic_standing", "منتظم")
        terms.append(row)

    if problems:
        sys.exit("The grades do not match the MyU summaries:\n  " + "\n  ".join(problems))

    published = [t for t in terms if t["status"] == "published"]
    current = next((t for t in terms if t["status"] != "published"), None)
    by_type = lambda *types: int(sum(c["credits"] for c in passed.values() if c["type"] in types))
    levels = rules["standing_by_credits"]
    level = next((l for l in levels if l["min"] <= cum_earned < l["max"]), levels[-1])
    student = {
        "student_id": sid, "persona": None, "persona_note": None,
        "personal": {"name_ar": src["name_ar"], "name_en": src["name_en"], "gender": src["gender"],
                     "birth_date": None, "birth_place": None, "nationality": None, "national_id": None,
                     "id_type": None},
        "contact": {"governorate": None, "city": None, "address": None, "mobile": None, "university_email": None},
        # No guardian or previous_qualification: left out, as the database export leaves them out when missing.
        "enrollment": {"university": "جامعة المنصورة", "faculty": "كلية الهندسة",
                       "program": "هندسة الذكاء الاصطناعي (AIE)", "enrollment_year": src["enrollment_year"]},
        "academic_status": {
            "level": level["level"], "name": level["name"], "required_hours": 160, "earned_hours": int(cum_earned),
            "mandatory_hours": by_type("mandatory"), "elective_hours": by_type("elective"),
            "project_hours": by_type("project"),
            "trainings_passed": sorted(code for code, c in passed.items() if c["type"] == "training"),
            "cumulative_gpa": published[-1]["summary"]["cumulative_gpa"] if published else None,
            "main_semesters_completed": main_done, "academic_standing": "منتظم", "consecutive_warning_semesters": 0,
            "current_term": {"academic_year": (current or published[-1])["academic_year"],
                             "term_ar": (current or published[-1])["term_ar"],
                             "registered_hours": int(sum(c["credits"] for c in current["courses"])) if current else 0}},
        "terms": terms,
    }
    advisors = [a["advisor_id"] for a in load("advisors.json")["advisors"]]
    return student, random.Random(sid).choice(advisors), history


def main():
    src = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    student, advisor, history = build(src)
    sid = student["student_id"]
    mock = {s["student_id"] for s in load("students.json")["students"]}
    if sid in mock:
        sys.exit(f"{sid} is already a mock student id in students.json")

    out = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"students": [], "advisors": {},
                                                                              "history": []}
    out["_note"] = NOTE
    out["students"] = [s for s in out["students"] if s["student_id"] != sid] + [student]
    out["advisors"] = {**{k: v for k, v in out["advisors"].items() if k != sid}, sid: advisor}
    out["history"] = [h for h in out["history"] if h["student_id"] != sid] + history
    out = {k: out[k] for k in ("_note", "students", "advisors", "history")}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    st = student["academic_status"]
    print(f"{sid} {student['personal']['name_en']}: {st['name']}, {st['earned_hours']} hours, GPA {st['cumulative_gpa']}, "
          f"advisor {advisor}, {len(history)} courses with an instructor. {len(out['students'])} real students now.")


if __name__ == "__main__":
    main()
