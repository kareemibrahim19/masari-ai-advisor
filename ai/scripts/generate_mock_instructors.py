"""Generate mock instructor data for Masari's instructor-recommendation tools.

Writes two files into ai/data/:
  instructors.json                 instructors + the survey profile of each (instructor, course) offering
  student_instructor_history.json  which instructor each mock student took each past course with, and the grade

EVERYTHING HERE IS SIMULATED. It has the shape the real survey data will have, so when the real
survey results arrive only these two files are replaced (same fields) and no tool code changes.
The five instructors i1..i5 are the ones the frontend already shows (ECE 321 / CSE 315).

Re-run to regenerate (deterministic, seeded):
    .venv\\Scripts\\python.exe ai\\scripts\\generate_mock_instructors.py
"""

import json
import random
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
COURSES = json.loads((DATA / "courses.json").read_text(encoding="utf-8"))["courses"]
STUDENTS = json.loads((DATA / "students.json").read_text(encoding="utf-8"))["students"]
GRADE_POINTS = json.loads((DATA / "courses.json").read_text(encoding="utf-8"))["rules"]["grade_points"]

rng = random.Random(2026)
DIMENSIONS = ["clarity", "pace", "workload", "practical", "difficulty", "satisfaction"]

# Teaching styles; each one is a typical profile (0-100) that a real instructor is a noisy version of.
STYLES = {
    "calm_clear": dict(clarity=86, pace=42, workload=45, practical=55, difficulty=48, satisfaction=82),
    "fast_demanding": dict(clarity=70, pace=82, workload=84, practical=78, difficulty=82, satisfaction=70),
    "hands_on": dict(clarity=76, pace=60, workload=65, practical=86, difficulty=60, satisfaction=77),
    "theoretical": dict(clarity=78, pace=55, workload=58, practical=30, difficulty=65, satisfaction=68),
    "balanced": dict(clarity=80, pace=52, workload=52, practical=58, difficulty=54, satisfaction=76),
}

# (name_ar, name_en, department group). The first five are the frontend's own demo instructors.
PEOPLE = [
    ("د. سارة محمود", "Dr. Sara Mahmoud", "ECE"),
    ("د. عمرو خليل", "Dr. Amr Khalil", "ECE"),
    ("د. ليلى حسن", "Dr. Laila Hassan", "ECE"),
    ("د. هاني فاروق", "Dr. Hany Farouk", "CSE"),
    ("د. منى عادل", "Dr. Mona Adel", "CSE"),
    ("د. طارق منصور", "Dr. Tarek Mansour", "CSE"),
    ("د. رانيا السيد", "Dr. Rania Elsayed", "CSE"),
    ("د. أحمد شاهين", "Dr. Ahmed Shaheen", "CSE"),
    ("د. نهى عبد الله", "Dr. Noha Abdallah", "CSE"),
    ("د. وليد صبري", "Dr. Walid Sabry", "CSE"),
    ("د. دعاء إبراهيم", "Dr. Doaa Ibrahim", "CSE"),
    ("د. كريم نجيب", "Dr. Karim Naguib", "CSE"),
    ("د. هبة الجمال", "Dr. Heba Elgamal", "CSE"),
    ("د. محمد رأفت", "Dr. Mohamed Raafat", "ECE"),
    ("د. ياسمين فوزي", "Dr. Yasmin Fawzy", "ECE"),
    ("د. شريف عزت", "Dr. Sherif Ezzat", "ECE"),
    ("د. إيمان زكي", "Dr. Eman Zaki", "BAS"),
    ("د. خالد عامر", "Dr. Khaled Amer", "BAS"),
    ("د. مروة حلمي", "Dr. Marwa Helmy", "BAS"),
    ("د. أسامة غنيم", "Dr. Osama Ghoneim", "BAS"),
    ("د. سمر لطفي", "Dr. Samar Lotfy", "BAS"),
    ("د. بسمة وهبة", "Dr. Basma Wahba", "UNR"),
    ("د. إسلام جاد", "Dr. Islam Gad", "UNR"),
    ("د. عبير سالم", "Dr. Abeer Salem", "ENG"),
    ("د. مصطفى رشدي", "Dr. Mostafa Roushdy", "ENG"),
]
FRONTEND = {  # id -> (style overrides, responses) so the frontend's demo numbers stay the same
    0: (dict(clarity=88, pace=45, workload=50, practical=70, difficulty=55, satisfaction=84), 142),
    1: (dict(clarity=70, pace=82, workload=85, practical=80, difficulty=82, satisfaction=72), 97),
    2: (dict(clarity=80, pace=50, workload=40, practical=55, difficulty=45, satisfaction=79), 9),
    3: (dict(clarity=76, pace=60, workload=65, practical=85, difficulty=60, satisfaction=77), 64),
    4: (dict(clarity=85, pace=40, workload=45, practical=50, difficulty=50, satisfaction=82), 120),
}
FRONTEND_COURSES = {"ECE 321": [0, 1, 2], "CSE 315": [3, 4]}
GROUP_OF_DEPT = {"CSE": "CSE", "ECE": "ECE", "BAS": "BAS", "UNR": "UNR", "PDE": "ENG", "ENG": "ENG", "ELE": "ECE"}


def clamp(x: float) -> int:
    return int(max(0, min(100, round(x))))


def noisy(profile: dict, sd: float) -> dict:
    return {d: clamp(profile[d] + rng.gauss(0, sd)) for d in DIMENSIONS}


# ------------------------------------------------------------------ instructors
instructors = []
for i, (name_ar, name_en, group) in enumerate(PEOPLE):
    if i in FRONTEND:
        base, responses = FRONTEND[i]
        style = "frontend_demo"
    else:
        style = rng.choice(list(STYLES))
        base = noisy(STYLES[style], 4)
        responses = rng.choice([8, 14, 25, 40, 60, 85, 110, 150])
    instructors.append(dict(id=f"i{i + 1}", name_ar=name_ar, name_en=name_en, department=group,
                            style=style, profile=base, responses=responses))
BY_ID = {x["id"]: x for x in instructors}
POOL = {}
for x in instructors:
    POOL.setdefault(x["department"], []).append(x["id"])

# ------------------------------------------------------------------ who teaches which course
# Trainings and graduation projects are supervised, not taught in sections, so they get no survey.
teachable = [c for c in COURSES if c["type"] in ("mandatory", "elective")]
roster = {}  # course_code -> [instructor ids]
for c in teachable:
    if c["code"] in FRONTEND_COURSES:
        roster[c["code"]] = [f"i{n + 1}" for n in FRONTEND_COURSES[c["code"]]]
        continue
    pool = POOL[GROUP_OF_DEPT[c["department"]]]
    n = 1 if c["department"] == "UNR" else rng.choice([2, 2, 3])
    roster[c["code"]] = rng.sample(pool, min(n, len(pool)))


def offered_term(c: dict) -> str:
    sem = c.get("planned_semester")
    if sem is None:  # electives can be offered in either main semester
        return "both"
    return "fall" if sem % 2 else "spring"


offerings = []
for c in teachable:
    for section, iid in enumerate(roster[c["code"]], start=1):
        ins = BY_ID[iid]
        frontend_row = c["code"] in FRONTEND_COURSES
        profile = ins["profile"] if frontend_row else noisy(ins["profile"], 6)
        responses = ins["responses"] if frontend_row else max(3, int(ins["responses"] * rng.uniform(0.3, 0.9)))
        offerings.append(dict(course_code=c["code"], section=str(section), instructor_id=iid,
                              offered_term=offered_term(c), responses=responses, profile=profile))

# ------------------------------------------------------------------ student history
# Each mock student has a hidden taste (pace / workload / practical, 0-100). A student tends to
# score better with instructors whose style is close to it, so the recommender has a signal to learn.
def fit(taste: dict, profile: dict) -> float:
    return 100 - (abs(profile["pace"] - taste["pace"]) + abs(profile["workload"] - taste["workload"])
                  + abs(profile["practical"] - taste["practical"])) / 3


history = []
offerings_by_course = {}
for o in offerings:
    offerings_by_course.setdefault(o["course_code"], []).append(o)

for s in STUDENTS:
    taste = dict(pace=rng.randint(25, 80), workload=rng.randint(30, 80), practical=rng.randint(30, 85))
    for t in s["terms"]:
        if t["status"] != "published":
            continue
        for course in t["courses"]:
            options = offerings_by_course.get(course["code"])
            if not options:
                continue
            ranked = sorted(options, key=lambda o: fit(taste, o["profile"]), reverse=True)
            strong = GRADE_POINTS.get(course["grade"], 0) >= 3.3
            chosen = ranked[0] if (strong and rng.random() < 0.7) or (not strong and rng.random() < 0.3) else ranked[-1]
            history.append(dict(student_id=s["student_id"], course_code=course["code"],
                                academic_year=t["academic_year"], term=t["term"], attempt=course["attempt"],
                                instructor_id=chosen["instructor_id"], section=chosen["section"],
                                grade=course["grade"], total=course["total"]))

out = {
    "_note": "بيانات وهمية للدكاترة واستبيانات التقييم، بنفس الشكل اللي هتيجي بيه الداتا الحقيقية.",
    "dimensions": DIMENSIONS,
    "instructors": instructors,
    "offerings": offerings,
}
(DATA / "instructors.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
(DATA / "student_instructor_history.json").write_text(
    json.dumps({"_note": "Simulated: which instructor each mock student took each past course with.",
                "rows": history}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"{len(instructors)} instructors, {len(offerings)} offerings, {len(history)} history rows")
