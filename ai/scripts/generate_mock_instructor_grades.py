"""Generate ai/data/instructor_grades.json: how students did in each course with its instructor, last 10 years.

EVERYTHING HERE IS SIMULATED, in the shape the faculty's real grade sheets will give:
  records    one per (course, academic year, instructor): number of students, average and median total, pass rate,
             grade counts, coursework and final averages, the average total by the students' GPA band, and
             whether extra points (a bonus) were added that year. A bonus is not a rule: an instructor may add one in
             some years and not in others, so only whether it happened is kept, not how many points
  this_term  who teaches each course this term. Usually one instructor teaches all of a course's sections; one big
             first-year course has two. An instructor may be teaching the course for the first time
             (no record of their own in it yet).

Who taught a course changes over the years (an instructor teaches it for a few years, then another takes it), and the
years the mock students took a course keep the instructor in student_instructor_history.json, so a student's own past
grade with an instructor matches this file. When the real sheets arrive only this file is replaced.

Each instructor has a grading pattern, and each year is a noisy run of it:
  lenient      an easier exam and high coursework marks: higher totals
  fair         a normal exam and coursework
  moderate     a harder exam, normal coursework
  strict       a hard exam and low coursework marks: lower totals and pass rates

Re-run to regenerate (deterministic, seeded):
    .venv\\Scripts\\python.exe ai\\scripts\\generate_mock_instructor_grades.py
"""

import json
import random
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
PROGRAM = json.loads((DATA / "courses.json").read_text(encoding="utf-8"))
COURSES = {c["code"]: c for c in PROGRAM["courses"]}
SCALE = PROGRAM["rules"]["grade_scale"]
PASS = PROGRAM["rules"]["passing"]
OFFERINGS = json.loads((DATA / "instructors.json").read_text(encoding="utf-8"))["offerings"]
YEARS = [f"{y}-{y + 1}" for y in range(2016, 2026)]  # the last 10 academic years, oldest first
STUDENTS = json.loads((DATA / "students.json").read_text(encoding="utf-8"))
HISTORY = json.loads((DATA / "student_instructor_history.json").read_text(encoding="utf-8"))["rows"]
TERM = STUDENTS["generated_for_term"]
# The one big first-year course taught by two instructors this term; every other course has one.
TWO_NOW = {"BAS 011"}
# How often each grading pattern adds extra points in a year (it varies, it is never certain).
BONUS_CHANCE = {"lenient": 0.6, "fair": 0.3, "moderate": 0.4, "strict": 0.1}
# Courses whose instructor teaches them for the first time this term (no record of their own yet).
FIRST_TIME = {"CSE 221", "ECE 333"}

# exam: points on the midterm/final; coursework: points on coursework (and practical).
STYLES = {
    "lenient": dict(exam=7, coursework=16),
    "fair": dict(exam=0, coursework=6),
    "moderate": dict(exam=-4, coursework=2),
    "strict": dict(exam=-9, coursework=-6),
}
# One style per instructor, so the same doctor grades the same way in every course (i1..i25).
STYLE_OF = {f"i{n}": s for n, s in zip(range(1, 26), [
    "fair", "strict", "lenient", "moderate", "lenient", "fair", "strict", "lenient", "fair", "moderate",
    "lenient", "fair", "strict", "lenient", "moderate", "fair", "lenient", "strict", "fair", "lenient",
    "moderate", "fair", "strict", "lenient", "fair"])}

rng = random.Random(2027)


def clamp(x, lo=0.0, hi=100.0):
    return max(lo, min(hi, x))


def letter(total: float, final_pct: float) -> str:
    if total < PASS["min_total_percent"] or final_pct < PASS["min_final_exam_percent"]:
        return "F"
    return next(g["grade"] for g in SCALE if total >= g["min_percent"])


def pct(sorted_xs: list[float], p: float) -> float:
    i = (len(sorted_xs) - 1) * p
    lo, hi = int(i), min(int(i) + 1, len(sorted_xs) - 1)
    return round(sorted_xs[lo] + (sorted_xs[hi] - sorted_xs[lo]) * (i - lo), 1)


def band(ability: float) -> str:
    return "under_2" if ability < -0.6 else "2_to_3" if ability < 0.6 else "3_plus"


def year_record(o: dict, year: str, course_base: float) -> dict:
    c = COURSES[o["course_code"]]
    a = c.get("assessment") or {"midterm": 20, "practical": 0, "coursework": 30, "final": 50}
    weight = {k: a.get(k, 0) for k in ("midterm", "practical", "coursework", "final")}
    style = STYLES[STYLE_OF[o["instructor_id"]]]
    st = {k: v + rng.gauss(0, 1.5) for k, v in style.items()}
    bonus = rng.randint(2, 5) if rng.random() < BONUS_CHANCE[STYLE_OF[o["instructor_id"]]] else 0
    n = rng.randint(32, 70)
    totals, finals, works, grades, by_band = [], [], [], {}, {}
    for _ in range(n):
        ab = rng.gauss(0, 1)
        exam = lambda: clamp(course_base + st["exam"] + 15 * ab + rng.gauss(0, 9))  # noqa: E731
        work = clamp(68 + st["coursework"] + 11 * ab + rng.gauss(0, 7))
        mid, fin = exam(), exam()
        total = (weight["midterm"] * mid + weight["final"] * fin
                 + (weight["coursework"] + weight["practical"]) * work) / sum(weight.values())
        total = clamp(total + bonus)
        g = letter(total, fin)
        totals.append(total)
        finals.append(fin)
        works.append(work)
        grades[g] = grades.get(g, 0) + 1
        by_band.setdefault(band(ab), []).append(total)
    xs = sorted(totals)
    passed = n - grades.get("F", 0)
    order = [s["grade"] for s in SCALE]
    return {
        "instructor_id": o["instructor_id"], "course_code": o["course_code"], "academic_year": year,
        "students": n, "mean": round(sum(xs) / n, 1),
        "median": pct(xs, 0.5),
        "pass_rate": round(passed / n, 3),
        "grades": {g: grades[g] for g in order if g in grades},
        "coursework_avg_pct": round(sum(works) / n, 1), "final_avg_pct": round(sum(finals) / n, 1),
        "bonus_added": bonus > 0,
        "by_gpa_band": {b: round(sum(v) / len(v), 1) for b, v in sorted(by_band.items())},
    }


def teachers_by_year(code: str, now: list[str], candidates: list[str], others: list[str]) -> list[set[str]]:
    """Who taught the course each year (oldest first): the current instructors for their last few years, earlier
    instructors before them in blocks of a few years, plus whoever the mock students' history says taught it."""
    tenure = {t: 0 if code in FIRST_TIME else rng.choice([2, 3, 4, 5, 6, 7, 10]) for t in now}
    if len(now) == 2:  # the two current instructors took the course over together
        tenure[now[1]] = tenure[now[0]]
    years: list[set[str]] = [set() for _ in YEARS]
    for i in range(len(YEARS)):
        age = len(YEARS) - 1 - i  # 0 = last year
        years[i] = {t for t in now if age < tenure[t]}
    earlier = [c for c in candidates + others if c not in now]
    i = len(YEARS) - 1
    while i >= 0:
        if years[i]:
            i -= 1
            continue
        who, block = rng.choice(earlier), rng.randint(2, 5)
        for j in range(i, max(-1, i - block), -1):
            if not years[j]:
                years[j] = {who}
        i -= block
    for h in HISTORY:
        if h["course_code"] == code and h["academic_year"] in YEARS:
            years[YEARS.index(h["academic_year"])].add(h["instructor_id"])
    return years


def main():
    # How hard the course is, the same for every instructor who teaches it (a course is hard for everyone).
    codes = sorted({o["course_code"] for o in OFFERINGS})
    base = {code: rng.uniform(64, 74) for code in codes}
    everyone = sorted({o["instructor_id"] for o in OFFERINGS}, key=lambda x: int(x[1:]))
    records, this_term = [], {}
    for code in codes:
        offers = [o for o in OFFERINGS if o["course_code"] == code]
        candidates = list(dict.fromkeys(o["instructor_id"] for o in offers))
        dept = [x for x in everyone if any(o["instructor_id"] == x and o["course_code"][:3] == code[:3] for o in OFFERINGS)]
        others = [x for x in dept if x not in candidates][:2] or [x for x in everyone if x not in candidates][:2]
        now = candidates[:2] if code in TWO_NOW and len(candidates) > 1 else candidates[:1]
        if code in FIRST_TIME:  # someone who never taught it, not even in the mock students' history
            taught = {h["instructor_id"] for h in HISTORY if h["course_code"] == code}
            now = [next(x for x in candidates + others + everyone if x not in taught)]
        if any(o["offered_term"] in (TERM["term"], "both") for o in offers):
            this_term[code] = now
        for i, who in enumerate(teachers_by_year(code, now, candidates, others)):
            for t in sorted(who, key=lambda x: int(x[1:])):
                records.append(year_record({"instructor_id": t, "course_code": code}, YEARS[i], base[code]))
    out = {
        "_note": "بيانات وهمية: درجات الطلاب في كل مادة مع الدكتور اللي درّسها، آخر 10 سنين (المتوسط، النجاح، التقديرات، "
                 "أعمال السنة، والمتوسط حسب معدل الطالب)، "
                 "ومين بيدرّس كل مادة الترم ده. بنفس شكل الشيتات الحقيقية.",
        "years": YEARS,
        "gpa_bands": {"under_2": "أقل من 2.00", "2_to_3": "من 2.00 لـ 3.00", "3_plus": "3.00 فأكتر"},
        "this_term": {**TERM, "teaching": this_term},
        "records": records,
    }
    # One record per line, so the file stays readable and its diffs small.
    lines = ",\n  ".join(json.dumps(r, ensure_ascii=False) for r in records)
    head = json.dumps({k: v for k, v in out.items() if k != "records"}, ensure_ascii=False, indent=1)[:-2]
    (DATA / "instructor_grades.json").write_text(f'{head},\n "records": [\n  {lines}\n ]\n}}\n', encoding="utf-8")
    two = sum(len(v) > 1 for v in this_term.values())
    print(f"{len(records)} records, {len(codes)} courses; this term {len(this_term)} courses, {two} with two instructors")


if __name__ == "__main__":
    main()
