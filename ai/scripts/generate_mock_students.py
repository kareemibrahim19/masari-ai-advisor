"""Generate realistic mock student records (ai/data/students.json) for testing Masari's rule tools.

The layout mirrors the university portal (myu.mans.edu.eg): personal / contact / guardian / previous
qualification data, then one entry per term with every course's marks, grade and the term summary.
Records are simulated term by term with the program rules from ai/data/courses.json, so they stay
consistent: prerequisites are passed before a course is taken, project level thresholds are respected,
the load limit follows the GPA, failed courses are retaken (grade capped at B+) and training is done in summer.

All people, numbers and contact details are fictional. Re-run to regenerate (deterministic, seeded):
    .venv\\Scripts\\python.exe ai\\scripts\\generate_mock_students.py
"""

import json
import random
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
PROGRAM = json.loads((DATA / "courses.json").read_text(encoding="utf-8"))
RULES = PROGRAM["rules"]
COURSES = {c["code"]: c for c in PROGRAM["courses"]}
GRADE_POINTS = RULES["grade_points"]

# Percentage → letter (article 21) and the pass rule (article 20), both from courses.json.
GRADE_SCALE = [(g["min_percent"], g["grade"]) for g in RULES["grade_scale"]]
PASS = RULES["passing"]
GRADE_AR = {"A+": "أ+", "A": "أ", "A-": "أ-", "B+": "ب+", "B": "ب", "B-": "ب-", "C+": "ج+", "C": "ج",
            "C-": "ج-", "D+": "د+", "D": "د", "F": "هـ", "P": "ناجح", "FP": "راسب"}
TERM_AR = {"fall": "الأول", "spring": "الثاني", "summer": "الصيفي"}
CURRENT = (2026, "fall")  # Fall 2026-2027: registered, results not announced yet
TRAINING_SUMMER_AFTER = {"ARI 171": 4, "ARI 271": 6, "ARI 371": 8}
MAX_SEMESTERS = 10

# Six students, each built to exercise a different rule.
PERSONAS = [
    dict(key="excellent", enrolled=2024, mean=94, sd=3.5, gender="F",
         name_ar="هنا محمد رضا الشربيني", name_en="Hana Mohamed Reda Elsherbiny",
         guardian_job="مهندس مدني", hs_percent=97.8,
         note="متفوقة (معدل فوق 3.5): الحد الأقصى 21 ساعة."),
    dict(key="probation", enrolled=2024, mean=73, sd=4, gender="M",
         fails={"BAS 115": 1, "CSE 141": 1, "ECE 121": 1}, summer_retakes=False,
         name_ar="يوسف محمود السيد النجار", name_en="Youssef Mahmoud Elsayed Elnaggar",
         guardian_job="محاسب", hs_percent=91.2,
         note="تحت الإنذار الأكاديمي ترمين ورا بعض (معدل أقل من 2): الحد الأقصى 12 ساعة، ولو الترم ده كمان تحت 2 يتفصل (3 ترمات متتالية)."),
    dict(key="near_graduation", enrolled=2022, mean=85, sd=5, gender="F",
         name_ar="سلمى أحمد فتحي القاضي", name_en="Salma Ahmed Fathy Elkady",
         guardian_job="طبيب", hs_percent=95.4,
         note="قربت تتخرج: في الترم التاسع ومعاها مشروع (2)، فاضلها الترم العاشر."),
    dict(key="failed_prerequisite", enrolled=2022, mean=81, sd=5, gender="M",
         fails={"ECE 332": 1}, summer_retakes=False,
         name_ar="عمر حسن إبراهيم عيسى", name_en="Omar Hassan Ibrahim Eissa",
         guardian_job="مدرس", hs_percent=93.6,
         note="سقط في الشبكات العصبونية ECE 332، فمقدرش ياخد التعلم العميق CSE 351، وبيعيد ECE 332 الترم ده."),
    dict(key="new_student", enrolled=2026, mean=85, sd=6, gender="F",
         name_ar="ملك طارق سامي حجازي", name_en="Malak Tarek Samy Hegazy",
         guardian_job="موظف بنك", hs_percent=96.1,
         note="طالبة جديدة في أول ترم: مسجلة مواد الترم الأول ومفيش نتايج لسه."),
    dict(key="retake", enrolled=2023, mean=77, sd=5, gender="M",
         fails={"BAS 216": 1}, summer_retakes=True,
         name_ar="زياد عمرو مصطفى البدوي", name_en="Ziad Amr Mostafa Elbadawy",
         guardian_job="صيدلي", hs_percent=92.5,
         note="سقط في الإحصاء وتحليل البيانات BAS 216 وأعاده في الصيفي، فتقديره اتحسب بحد أقصى B+."),
]


# ------------------------------------------------------------------ helpers

def letter(total: float, course: dict, marks: dict) -> str:
    """Article 20: a pass needs 60% of the total and 40% of the final written exam."""
    final_max = (course.get("assessment") or {}).get("final")
    if total < PASS["min_total_percent"]:
        return "F"
    if final_max and marks.get("final", 0) < final_max * PASS["min_final_exam_percent"] / 100:
        return "F"
    return next(g for cut, g in GRADE_SCALE if total >= cut)


def cap_retake(grade: str) -> str:
    cap = RULES["retake_max_grade"]
    return cap if GRADE_POINTS[grade] > GRADE_POINTS[cap] else grade


def term_label(year: int, term: str) -> str:
    """Academic year of a term: fall 2024 and spring/summer 2025 both belong to 2024-2025."""
    start = year if term == "fall" else year - 1
    return f"{start}-{start + 1}"


def timeline(enrolled: int):
    """(year, term, plan_semester) from enrolment up to and including the current term."""
    out, sem, year = [], 1, enrolled
    while True:
        for term, y in (("fall", year), ("spring", year + 1), ("summer", year + 1)):
            out.append((y, term, sem if term != "summer" else sem - 1))
            if (y, term) == CURRENT:
                return out
            if term != "summer":
                sem += 1
        year += 1


def on_warning(cgpa, main_done: int) -> bool:
    """Academic warning: cumulative GPA under 2.00 from the 2nd main semester on (dashboard)."""
    return (cgpa is not None and cgpa < RULES["warning_gpa_threshold"]
            and main_done >= RULES["warning_starts_after_main_semester"])


def level_of(earned: int) -> dict:
    """Standing by earned credits (Freshman / Sophomore / Junior / Senior), as on the portal's hours page."""
    band = next(b for b in reversed(RULES["standing_by_credits"]) if earned >= b["min"])
    return {"level": band["level"], "name": band["name"]}


def max_load(cgpa, main_done: int):
    if cgpa is None:
        return 21
    if on_warning(cgpa, main_done):
        return RULES["probation_max_credits"]  # team decision: a student on warning → 12 (dashboard)
    for band in RULES["max_credits_by_gpa"]:
        if band["gpa_min"] <= cgpa < band["gpa_max"]:
            return band["max_credits"]
    return 21



def split_marks(course: dict, total: float) -> dict:
    """Spread a total mark over the course's assessment parts (e.g. midterm 20, coursework 30, final 50)."""
    parts = {k: v for k, v in (course.get("assessment") or {}).items() if v}
    if not parts:
        return {}
    out, left = {}, round(total)
    keys = list(parts)
    for k in keys[:-1]:
        out[k] = min(parts[k], round(total * parts[k] / 100))
        left -= out[k]
    out[keys[-1]] = max(0, min(parts[keys[-1]], left))
    return out


# ------------------------------------------------------------------ simulation

def simulate(p: dict, rng: random.Random) -> tuple[list[dict], dict]:
    fails_left = dict(p.get("fails", {}))
    best: dict[str, dict] = {}       # code -> latest attempt (latest counts, retakes capped at B+)
    attempts: dict[str, int] = {}
    electives_taken: set[str] = set()
    terms = []
    main_done, low_streak = 0, 0

    def passed(code):
        a = best.get(code)
        return bool(a) and a["grade"] not in ("F", "FP")

    def gpa_now():
        graded = [a for a in best.values() if a["grade"] in GRADE_POINTS]
        hours = sum(COURSES[a["code"]]["credits"] for a in graded)
        if not hours:
            return None
        return round(sum(GRADE_POINTS[a["grade"]] * COURSES[a["code"]]["credits"] for a in graded) / hours, 2)

    def earned():
        return sum(COURSES[c]["credits"] for c in best if passed(c))

    def eligible(code):
        c = COURSES[code]
        return (all(passed(pr) for pr in c["prerequisites"])
                and earned() >= (c.get("min_credits_required") or 0))

    for year, term, sem in timeline(p["enrolled"]):
        current = (year, term) == CURRENT
        if term == "summer":
            pick = [code for code, s in TRAINING_SUMMER_AFTER.items() if s == sem and not passed(code) and eligible(code)]
            if p.get("summer_retakes"):
                retakes = [c for c in best if not passed(c) and COURSES[c]["type"] != "project" and eligible(c)]
                pick += retakes[:RULES["summer"]["max_courses"]]
            if not pick:
                continue
        else:
            parity = 1 if term == "fall" else 0
            # Plan courses of this term's parity up to the student's plan semester (missed ones are caught up).
            due = [c for c in COURSES.values()
                   if c["planned_semester"] and c["planned_semester"] <= min(sem, MAX_SEMESTERS)
                   and c["planned_semester"] % 2 == parity and c["code"] not in TRAINING_SUMMER_AFTER
                   and not passed(c["code"]) and eligible(c["code"])]
            due.sort(key=lambda c: (c["planned_semester"], c["code"]))
            # Elective slots of this semester: first eligible course from the slot's pool.
            for slot in PROGRAM["elective_slots"]:
                if slot["semester"] == sem:
                    pool = next(pl["courses"] for pl in PROGRAM["elective_pools"] if slot["slot"] in pl["slots"])
                    options = [c for c in pool if c not in electives_taken and eligible(c)]
                    if options:
                        choice = rng.choice(options)
                        electives_taken.add(choice)
                        due.append(COURSES[choice])
            limit, load, pick = max_load(gpa_now(), main_done), 0, []
            for c in due:
                if load + c["credits"] <= limit:
                    pick.append(c["code"])
                    load += c["credits"]
            if not pick:
                continue

        rows = []
        for code in pick:
            c = COURSES[code]
            attempts[code] = attempts.get(code, 0) + 1
            row = {"code": code, "name_ar": c["name_ar"], "name_en": c.get("name_en"), "credits": c["credits"],
                   "attempt": attempts[code]}
            if not current:
                if fails_left.get(code):
                    total = rng.uniform(35, 58)
                    fails_left[code] -= 1
                else:
                    total = min(100, max(PASS["min_total_percent"], rng.gauss(p["mean"], p["sd"])))
                total = round(total)
                marks = split_marks(c, total)
                if c.get("graded") is False:
                    grade = "P" if total >= PASS["min_total_percent"] else "FP"
                else:
                    grade = letter(total, c, marks)
                    if attempts[code] > 1 and grade != "F":
                        grade = cap_retake(grade)
                row.update(marks=marks, total=total, grade=grade, grade_ar=GRADE_AR[grade])
                best[code] = row
            rows.append(row)

        entry = {"academic_year": term_label(year, term), "term": term, "term_ar": TERM_AR[term],
                 "status": "in_progress" if current else "published", "courses": rows}
        if not current:
            graded = [r for r in rows if r["grade"] in GRADE_POINTS]
            hours = sum(r["credits"] for r in graded)
            entry["summary"] = {
                "registered_hours": sum(r["credits"] for r in rows),
                "earned_hours": sum(r["credits"] for r in rows if r["grade"] not in ("F", "FP")),
                "term_gpa": round(sum(GRADE_POINTS[r["grade"]] * r["credits"] for r in graded) / hours, 2) if hours else None,
                "cumulative_gpa": gpa_now(),
                "cumulative_earned_hours": earned(),
            }
            if term != "summer":
                main_done += 1
                warned = on_warning(gpa_now(), main_done)
                low_streak = low_streak + 1 if warned else 0
                entry["summary"]["academic_standing"] = "إنذار أكاديمي" if warned else "منتظم"
        terms.append(entry)

    # The portal's "hours progress" view: level, required vs passed hours, split by course type.
    passed_codes = [c for c in best if passed(c)]
    by_type = lambda *types: sum(COURSES[c]["credits"] for c in passed_codes if COURSES[c]["type"] in types)
    cgpa = gpa_now()
    now = next((t for t in terms if t["status"] == "in_progress"), None)
    status = {
        **level_of(earned()),
        "required_hours": PROGRAM["program"]["total_credits"],
        "earned_hours": earned(),
        "mandatory_hours": by_type("mandatory"),
        "elective_hours": by_type("elective"),
        "project_hours": by_type("project"),
        "trainings_passed": [c for c in RULES["graduation"]["trainings_required"] if passed(c)],
        "cumulative_gpa": cgpa,
        "main_semesters_completed": main_done,
        "academic_standing": "إنذار أكاديمي" if on_warning(cgpa, main_done) else "منتظم",
        "consecutive_warning_semesters": low_streak,
        "current_term": {"academic_year": now["academic_year"], "term_ar": now["term_ar"],
                         "registered_hours": sum(r["credits"] for r in now["courses"])} if now else None,
    }
    return terms, status


# ------------------------------------------------------------------ fictional personal data

def national_id(rng, birth, gender):
    """14 digits: century (3 = 2000s), YYMMDD, governorate (12 = Dakahlia), serial, gender digit, check digit."""
    y, m, d = birth.split("-")
    serial = f"{rng.randint(0, 999):03d}"
    gender_digit = rng.choice("13579" if gender == "M" else "02468")
    return f"3{y[2:]}{m}{d}12{serial}{gender_digit}{rng.randint(1, 9)}"


def build(p):
    rng = random.Random(f"masari-{p['key']}")  # per-student seed: editing one persona leaves the others unchanged
    first_en = p["name_en"].split()[0].lower()
    sid = f"8{rng.randint(10_000_000, 99_999_999)}"
    birth_year = p["enrolled"] - 18
    birth = f"{birth_year}-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}"
    father = " ".join(p["name_ar"].split()[1:])
    hs_total = round(410 * p["hs_percent"] / 100, 1)
    terms, status = simulate(p, rng)
    return {
        "student_id": sid,
        "persona": p["key"],
        "persona_note": p["note"],
        "personal": {
            "name_ar": p["name_ar"], "name_en": p["name_en"],
            "gender": "ذكر" if p["gender"] == "M" else "أنثى",
            "birth_date": birth, "birth_place": "المنصورة", "nationality": "مصر",
            "national_id": national_id(rng, birth, p["gender"]), "id_type": "بطاقة رقم قومي",
        },
        "contact": {
            "governorate": "الدقهلية", "city": "المنصورة",
            "address": f"{rng.randint(1, 120)} شارع {rng.choice(['الجيش', 'الجمهورية', 'قناة السويس', 'الترعة', 'جيهان'])}، المنصورة",
            "mobile": f"01{rng.choice('0125')}{rng.randint(10_000_000, 99_999_999)}",
            "university_email": f"{first_en}{sid[-4:]}@std.mans.edu.eg",
        },
        "guardian": {
            "name": father, "relation": "الأب", "job": p["guardian_job"],
            "mobile": f"01{rng.choice('0125')}{rng.randint(10_000_000, 99_999_999)}",
        },
        "previous_qualification": {
            "qualification": "ثانوي عام رياضة", "year": f"{p['enrolled'] - 1}-{p['enrolled']}",
            "total": hs_total, "max_total": 410, "percentage": p["hs_percent"], "round": "الدور الأول",
            "transferred_from": None,
        },
        "enrollment": {
            "university": "جامعة المنصورة", "faculty": "كلية الهندسة",
            "program": "هندسة الذكاء الاصطناعي (AIE)", "enrollment_year": f"{p['enrolled']}-{p['enrolled'] + 1}",
        },
        "academic_status": status,
        "terms": terms,
    }


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    students = [build(p) for p in PERSONAS]
    out = {
        "_note": "Fictional students for development and demos only. Generated by ai/scripts/generate_mock_students.py.",
        "generated_for_term": {"academic_year": term_label(*CURRENT), "term": CURRENT[1]},
        "students": students,
    }
    (DATA / "students.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    for s in students:
        last = next((t["summary"] for t in reversed(s["terms"]) if t["status"] == "published"), {})
        now = next((t for t in s["terms"] if t["status"] == "in_progress"), None)
        print(f"{s['student_id']} {s['persona']:<20} CGPA={last.get('cumulative_gpa')}  "
              f"earned={last.get('cumulative_earned_hours', 0)}  now={[c['code'] for c in now['courses']] if now else []}")


if __name__ == "__main__":
    main()
