"""Simulated student journeys: students live term by term, and Masari is asked what it says at every term.

Each scenario is a fictional student with a story (an excellent student, one who slips under 2.00, one whose
summer courses are not opened...). From the first term to graduation (or dismissal):

  1. Masari is asked, as the student sees it during the term: credit limit, standing, paper registration and
     the graduation plan (with the table of all targets).
  2. The term is graded by the scenario (marks -> letter grades with the regulation's pass rule and B+ cap).
  3. The plan after the results decides what the student registers next term (the student follows Masari),
     and the summer courses only run if the scenario's college opens them.
  4. An independent checker, written from the numbers in courses.json and not from the tools' code, flags any
     registration or answer that breaks a rule.

Nothing here touches ai/data/students.json or the database: the simulated students live only in this script.
Run from the repo root (same seed, same journeys):
    .venv\\Scripts\\python.exe ai\\scripts\\simulate_journeys.py
Writes ai/simulation/journeys.json (every term, every answer) and ai/simulation/report.html (for people).
"""

import html
import json
import copy
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "chatbot"))
sys.path.insert(0, str(ROOT / "scripts"))
import generate_mock_students as gen  # noqa: E402  (grading helpers: letter, split_marks, cap_retake...)
from tools import _data as d  # noqa: E402
from tools import planner, rules  # noqa: E402

OUT = ROOT / "simulation"
COURSES = d.courses()
R = d.rules()
GP = R["grade_points"]
ENROLLED = 2026
MAX_TERMS = 30  # safety stop (main + summer terms)

# ---------------------------------------------------------------- scenarios
# grades: [(from main semester, mean %, sd)], the last row that applies is used. fail: courses failed on their
# first attempt(s) ({code: times}). fail_in: {main semester: number of courses failed that term}.

SCENARIOS = [
    dict(key="excellent", sid="SIM-01", student="هنا وليد عبد الحميد الشناوي", name="المتفوقة", target=4, summer=True, summer_opens=True,
         grades=[(1, 95, 3)],
         story="درجات عالية طول الوقت، وعايزة تتخرج في 4 سنين.",
         expect="حد 21 ساعة بعد أول ترم، ومنتظمة طول الوقت، وتتخرج في 4 سنين أو قبلها."),
    dict(key="steady", sid="SIM-02", student="محمد خالد فوزي الدسوقي", name="المنتظم", target=5, summer=False, summer_opens=False,
         grades=[(1, 80, 5)],
         story="طالب متوسط (B تقريبًا)، ماشي على خطة اللائحة من غير صيفي.",
         expect="حد 18 ساعة، ومنتظم، ويتخرج في 5 سنين (خطة اللائحة)."),
    dict(key="slipping", sid="SIM-03", student="كريم أشرف نبيل سليمان", name="النازل", target=4.5, summer=True, summer_opens=True,
         grades=[(1, 82, 4), (3, 61, 2), (6, 84, 4)],
         story="بدأ كويس، وبعدين درجاته وقعت من الترم التالت لحد الخامس، ورجع اتحسن.",
         expect="الحد ينزل من 18 لـ 14 أول ما المعدل يقع تحت 2.00، ويفضل 14 تحت الإنذار، والتخرج يتأخر. "
                "ولما يتحسن ويعدّي 2.00 الحد يرجع 18."),
    dict(key="dismissal", sid="SIM-04", student="أحمد ياسر رمضان العزب", name="المفصول", target=5, summer=False, summer_opens=False,
         grades=[(1, 62, 4)], fail_in={2: 2, 3: 2, 4: 2},
         story="درجاته ضعيفة من الأول وبيسقط في مواد كل ترم.",
         expect="إنذار من بعد الترم التاني، و14 ساعة، وبعد 6 ترمات إنذار ورا بعض يتفصل "
                "(إلا لو مجلس الكلية إداله فرصة أخيرة، وده محتاج 80% من الساعات)."),
    dict(key="recovery", sid="SIM-05", student="مصطفى عادل حسين غنيم", name="الراجع", target=5, summer=True, summer_opens=True,
         grades=[(1, 64, 3), (3, 92, 3)], fail_in={2: 1},
         story="تحت الإنذار في الأول، وبعدين اتحسن جامد من الترم التالت.",
         expect="14 ساعة تحت الإنذار، وأول ما المعدل يعدّي 2.00 الإنذار يتشال والحد يرجع 18، والخطة تتحسن."),
    dict(key="failed_chain", sid="SIM-06", student="يوسف إيهاب منير الجمال", name="الساقط في متطلب", target=4.5, summer=False, summer_opens=False,
         grades=[(1, 82, 4)], fail={"BAS 115": 2},
         story="سقط مرتين في مادة متطلب سابق لمواد كتير بعدها (BAS 115).",
         expect="المواد اللي محتاجاها متتسجلش قبل ما ينجح فيها، والتخرج يتأخر، وتقديره في الإعادة أقصاه B+."),
    dict(key="summer_user", sid="SIM-07", student="عبد الرحمن سامح جمال زيدان", name="بتاع الصيفي", target=4, summer=True, summer_opens=True,
         grades=[(1, 78, 5)], fail={"CSE 141": 1},
         story="طالب متوسط عايز يتخرج في 4 سنين، فبياخد صيفي، والكلية بتفتح المواد.",
         expect="الخطة تحط مواد في الصيفي (6 ساعات بالكتير، ومن غير مشاريع)، ويلحق 4 سنين أو قريب منها."),
    dict(key="summer_closed", sid="SIM-08", student="مريم هشام شوقي البنا", name="الصيفي اتقفل", target=4, summer=True, summer_opens=False,
         grades=[(1, 78, 5)], fail={"CSE 141": 1},
         story="نفس \"بتاع الصيفي\" بالظبط (نفس الدرجات والهدف)، بس الكلية مفتحتش مواد الصيفي اللي طلبتها (التدريب بس).",
         expect="الخطة كل ترم تحط مواد صيفي، ولما متتفتحش ميعاد التخرج يتأخر عن \"بتاع الصيفي\"."),
    dict(key="low_first_term", sid="SIM-09", student="نورهان طارق مجدي عوض", name="أول ترم ضعيف", target=5, summer=False, summer_opens=False,
         grades=[(1, 66, 3), (2, 85, 4)],
         story="أول ترم معدله تحت 2.00، وبعدين اتظبط.",
         expect="الترم التاني: 14 ساعة على السيستم أو 15 ورقي (5 مواد × 3 ساعات)، لأنه لسه مش تحت الإنذار. "
                "ولو المعدل عدّى 2.00 الحد يرجع 18."),
    dict(key="last_chance", sid="SIM-11", student="ليلى أسامة فكري النمر", name="الفرصة الأخيرة", target=5,
         summer=False, summer_opens=False, council=True,
         grades=[(1, 72, 2), (9, 60, 0), (12, 92, 2)], fail_in={9: 4, 10: 4, 11: 4},
         story="ماشية على الحافة (C تقريبًا)، وبعدين وقعت جامد في الترم التاسع بعد ما عدّت 80% من الساعات، وفي الفرصة الأخيرة اتحسنت.",
         expect="بعد 3 ترمات إنذار مساري يقولها إن ممكن المجلس يديها فرصة أخيرة (فصلين) لأنها محققة شرط الـ 128 ساعة. "
                "المحاكي بيفترض إن المجلس وافق، ولو المعدل عدّى 2.00 في الفصلين دول تكمّل، غير كده تتفصل."),
    dict(key="stuck", sid="SIM-18", student="خالد ماهر عزت الطنطاوي", name="خلّص المواد ومعدله تحت 2", target=5,
         summer=False, summer_opens=False, council=True,
         grades=[(1, 73, 2), (9, 60, 0), (14, 85, 2)], fail_in={9: 4, 10: 4, 11: 3},
         story="ماشي على الحافة، ووقع في آخر سنتين (وأخد فرصة أخيرة من المجلس)، وخلّص كل المواد والساعات بس معدله "
               "التراكمي تحت 2.00. وفي التحسين بيجيب درجات كويسة.",
         expect="شرط التخرج معدل 2.00 على الأقل (مادة 26)، فمش هيتخرج بالـ 160 ساعة لوحدها. بعد ما يخلّص البرنامج يقدر "
                "يحسّن أي مواد لحد ما يوصل 2.00 (مادة 30)، فمساري المفروض يقوله أنهي مواد يعيدها."),
    dict(key="edge", sid="SIM-12", student="عمر حازم عصام الصياد", name="على الحافة", target=5,
         summer=False, summer_opens=False,
         grades=[(1, 72, 3), (2, 66, 2), (3, 80, 2), (4, 66, 2), (5, 80, 2), (6, 74, 4)],
         story="معدله رايح جاي حوالين 2.00: ترم فوق وترم تحت.",
         expect="الإنذار يتشال لما المعدل يعدّي 2.00، وعدّاد الترمات المتتالية يرجع صفر، فمش هيتفصل إلا لو 6 ورا بعض. "
                "والحد بيتنقل بين 14 و18."),
    dict(key="failed_training", sid="SIM-13", student="سارة رامي حمدي الفقي", name="سقطت في التدريب", target=4.5,
         summer=True, summer_opens=True,
         grades=[(1, 84, 4)], fail={"ARI 171": 1, "ARI 271": 1},
         story="شاطرة، بس سقطت في التدريب الأول والتاني.",
         expect="التدريب يتعاد لحد ما تنجح (في الصيفي، أو في ترم أساسي بموافقة الكلية)، والتخرج يتأخر لو التدريب بقى آخر حاجة."),
    dict(key="failed_project", sid="SIM-14", student="حسام الدين وائل نصر", name="سقط في المشروع", target=4.5,
         summer=True, summer_opens=True,
         grades=[(1, 82, 4)], fail={"ARI 381": 1, "ARI 482": 1},
         story="سقط في مشروع 1، وبعدين سقط تاني في مشروع 3 في ترم التخرج.",
         expect="المشاريع ورا بعض (1 ثم 2 ثم 3)، كل واحد في ترم أساسي ومش في الصيفي، فكل سقوط بيأخر التخرج ترم على الأقل."),
    dict(key="failed_elective", sid="SIM-15", student="جنى محمود عاطف رزق", name="سقطت في اختياري", target=4.5,
         summer=False, summer_opens=False,
         grades=[(1, 80, 4)], fail_type={"elective": 2},
         story="سقطت في أول مادتين اختياري سجلتهم.",
         expect="تقدر تعيد نفس المادة أو تختار اختياري تاني من نفس المجموعة، وعدد الاختياري المطلوب (اتنين في 300 وتلاتة في 400) لازم يكمل."),
    dict(key="part_time", sid="SIM-16", student="أنس مدحت فاروق الحناوي", name="بيشتغل جنب الدراسة", target=5,
         summer=False, summer_opens=False, max_load=12,
         grades=[(1, 85, 4)],
         story="شاطر بس بيشتغل، فبيسجل 12 ساعة بس كل ترم حتى لو حده أكتر.",
         expect="الخطة كل ترم تتحسب من جديد وتبيّن إن 5 سنين مش هتلحق بـ 12 ساعة (160 ساعة على 12 = حوالي 14 ترم)، "
                "وأقرب تخرج يتأخر."),
    dict(key="gpa_lever", sid="SIM-17", student="ريم أحمد سمير الشيخ", name="محتاجة ترفع معدلها", target=4,
         summer=False, summer_opens=False,
         grades=[(1, 81, 2), (3, 93, 2)],
         story="معدلها أقل من 3.00 شوية، وعايزة 4 سنين من غير صيفي، وبعدين اتحسنت.",
         expect="مساري يقولها (ممكن بشرط): ترفع المعدل لـ 3.00 عشان تاخد 21 ساعة، أو تحضر صيفي. ولما توصل 3.00 الحد يبقى 21."),
    dict(key="many_fails", sid="SIM-10", student="آدم شريف صلاح الشافعي", name="متأخر في الساعات", target=4.5, summer=False, summer_opens=False,
         grades=[(1, 78, 4)], fail_in={3: 2, 4: 2, 5: 2},
         story="بيسقط في مادتين كل ترم من التالت للخامس، فساعاته بتتأخر عن زمايله وقت المشاريع.",
         expect="المشروع ممكن يتسجل ورقي لو ساعاته ناقصة جوه السماحية (4 لمشروع 1 و2، و6 لمشروع 3)، "
                "وترم التخرج ممكن يبقى أقل من 12 ورقي."),
]


# ---------------------------------------------------------------- the simulated student record

class Student:
    def __init__(self, sc: dict):
        self.sc = sc
        self.sid = sc["sid"]
        self.rng = random.Random(f"masari-sim-{sc['key']}")
        self.enrolled = sc.get("enrolled", ENROLLED)
        self.fails_left = dict(sc.get("fail", {}))
        self.type_fails_left = dict(sc.get("fail_type", {}))  # e.g. {"elective": 2}: the first two electives fail
        self.chance = None  # main semesters left in a last chance from the Faculty Council
        self.terms: list[dict] = []
        self.main_done = 0
        self.streak = 0
        self.pending: list[str] = []  # checker issues about the registration of the current term
        base = sc.get("base")
        if base:
            self.terms = copy.deepcopy(base["terms"])
            self.main_done = base["academic_status"]["main_semesters_completed"]
            self.streak = base["academic_status"]["consecutive_warning_semesters"]

    # what the tools see
    def best(self) -> dict:
        return d.best_attempts({"terms": self.terms})

    def passed(self) -> set:
        return {c for c, a in self.best().items() if d.passed(a)}

    def earned(self) -> int:
        return sum(COURSES[c]["credits"] for c in self.passed())

    def cgpa(self):
        graded = [a for a in self.best().values() if a["grade"] in GP]
        hours = sum(a["credits"] for a in graded)
        return round(sum(GP[a["grade"]] * a["credits"] for a in graded) / hours, 2) if hours else None

    def record(self) -> dict:
        cgpa, earned, passed = self.cgpa(), self.earned(), self.passed()
        warned = gen.on_warning(cgpa, self.main_done)
        by_type = lambda *ts: sum(COURSES[c]["credits"] for c in passed if COURSES[c]["type"] in ts)
        return {
            "student_id": self.sid, "persona": self.sc["key"],
            "enrollment": {"enrollment_year": f"{self.enrolled}-{self.enrolled + 1}"},
            "academic_status": {
                **gen.level_of(earned), "required_hours": d.program()["program"]["total_credits"],
                "earned_hours": earned, "mandatory_hours": by_type("mandatory"),
                "elective_hours": by_type("elective"), "project_hours": by_type("project"),
                "trainings_passed": [c for c in R["graduation"]["trainings_required"] if c in passed],
                "cumulative_gpa": cgpa, "main_semesters_completed": self.main_done,
                "academic_standing": "إنذار أكاديمي" if warned else "منتظم",
                "consecutive_warning_semesters": self.streak,
            },
            "terms": self.terms,
        }

    # one term
    def register(self, year: int, term: str, codes: list[str]) -> None:
        attempts = {}
        for t in self.terms:
            for c in t["courses"]:
                attempts[c["code"]] = attempts.get(c["code"], 0) + 1
        rows = [{"code": c, "name_ar": COURSES[c]["name_ar"], "name_en": COURSES[c].get("name_en"),
                 "credits": COURSES[c]["credits"], "attempt": attempts.get(c, 0) + 1} for c in codes]
        self.terms.append({"academic_year": gen.term_label(year, term), "term": term, "term_ar": gen.TERM_AR[term],
                           "status": "in_progress", "courses": rows})

    def grades_for(self, main_sem: int) -> tuple[float, float]:
        mean, sd = self.sc["grades"][0][1:]
        for start, m, s in self.sc["grades"]:
            if main_sem >= start:
                mean, sd = m, s
        return mean, sd

    def decide(self, main_sem: int) -> dict:
        """The marks of the current term (decided before grading, so the plan can be asked about them)."""
        cur = self.terms[-1]
        mean, sd = self.grades_for(main_sem)
        forced = set()
        n = self.sc.get("fail_in", {}).get(main_sem, 0) if cur["term"] != "summer" else 0
        graded = [c["code"] for c in cur["courses"] if COURSES[c["code"]].get("graded", True)
                  and COURSES[c["code"]]["type"] not in ("project", "training")]
        forced |= set(self.rng.sample(graded, min(n, len(graded))))
        for code in list(self.fails_left):
            if code in [c["code"] for c in cur["courses"]] and self.fails_left[code] > 0:
                forced.add(code)
                self.fails_left[code] -= 1
        for c in cur["courses"]:
            kind = COURSES[c["code"]]["type"]
            if self.type_fails_left.get(kind, 0) > 0:
                forced.add(c["code"])
                self.type_fails_left[kind] -= 1
        out = {}
        for c in cur["courses"]:
            course = COURSES[c["code"]]
            total = self.rng.uniform(35, 58) if c["code"] in forced else min(100, max(60, self.rng.gauss(mean, sd)))
            total = round(total)
            marks = gen.split_marks(course, total)
            if course.get("graded") is False:
                grade = "P" if total >= 60 else "FP"
            else:
                grade = gen.letter(total, course, marks)
                before = self.best().get(c["code"])
                if before and not d.passed(before) and grade != "F":
                    grade = gen.cap_retake(grade)
            out[c["code"]] = {"marks": marks, "total": total, "grade": grade, "grade_ar": gen.GRADE_AR[grade]}
        return out

    def publish(self, results: dict) -> dict:
        cur = self.terms[-1]
        for c in cur["courses"]:
            c.update(results[c["code"]])
        cur["status"] = "published"
        graded = [c for c in cur["courses"] if c["grade"] in GP]
        hours = sum(c["credits"] for c in graded)
        cur["summary"] = {
            "registered_hours": sum(c["credits"] for c in cur["courses"]),
            "earned_hours": sum(c["credits"] for c in cur["courses"] if c["grade"] not in ("F", "FP")),
            "term_gpa": round(sum(GP[c["grade"]] * c["credits"] for c in graded) / hours, 2) if hours else None,
            "cumulative_gpa": self.cgpa(), "cumulative_earned_hours": self.earned(),
        }
        if cur["term"] != "summer":
            self.main_done += 1
            warned = gen.on_warning(self.cgpa(), self.main_done)
            self.streak = self.streak + 1 if warned else 0
            cur["summary"]["academic_standing"] = "إنذار أكاديمي" if warned else "منتظم"
        return cur["summary"]

    def done(self) -> bool:
        """Every graduation requirement met (article 26 as in courses.json)."""
        g, passed = R["graduation"], self.passed()
        required = all(c["code"] in passed for c in COURSES.values() if c["type"] != "elective")
        electives = all(sum(1 for c in p["courses"] if c in passed) >= p["choose"]
                        for p in d.program()["elective_pools"])
        return required and electives and self.earned() >= g["min_credits"]


# ---------------------------------------------------------------- the independent checker

def expected_cap(cgpa, main_done: int) -> int:
    if cgpa is None:
        return 18  # first term (the website's rule engine)
    return next(b["max_credits"] for b in R["max_credits_by_gpa"] if b["gpa_min"] <= cgpa < b["gpa_max"])


def check_registration(st: Student, codes: list[str], term: str, is_last: bool, improving=()) -> list[str]:
    """Rules the registration of this term breaks, from courses.json only."""
    issues, best = [], st.best()
    passed = {c for c, a in best.items() if d.passed(a)}
    earned, cgpa = st.earned(), st.cgpa()
    hours = sum(COURSES[c]["credits"] for c in codes)
    for c in codes:
        course = COURSES[c]
        for p in d.prereqs(course):
            if p not in passed:
                issues.append(f"{c} اتسجلت قبل ما ينجح في المتطلب {p}")
        need = course.get("min_credits_required") or 0
        least = need - (course.get("min_credits_tolerance") or 0)
        if earned < least:
            issues.append(f"{c} محتاجة {least} ساعة على الأقل (بالسماحية)، ومعاه {earned}")
        if c in passed and best[c]["grade"] not in ("F", "FP") and not (c in improving and st.done()):
            issues.append(f"{c} اتسجلت تاني وهو ناجح فيها")
        if term == "summer" and course["type"] == "project":
            issues.append(f"مشروع {c} في الصيفي")
        if term != "summer" and course["type"] == "mandatory" and course["planned_semester"]:
            if (course["planned_semester"] % 2 == 1) != (term == "fall") and not is_last:
                issues.append(f"{c} في غير ترمها ومش ترم التخرج")
    if term == "summer":
        if hours > R["summer"]["max_credits"]:
            issues.append(f"{hours} ساعة في الصيفي (الحد {R['summer']['max_credits']})")
    else:
        cap = expected_cap(cgpa, st.main_done)
        paper15 = (cap == 14 and hours == 15 and len(codes) == 5
                   and all(COURSES[c]["credits"] == 3 for c in codes))
        if hours > cap and not paper15:
            issues.append(f"{hours} ساعة فوق الحد ({cap}) بمعدل {cgpa}")
        if hours < R["min_credits_main_semester"] and not is_last:
            issues.append(f"{hours} ساعة بس (أقل من 12) ومش ترم التخرج")
    return issues


# ---------------------------------------------------------------- asking Masari

def ask(st: Student) -> dict:
    sid, sc = st.sid, st.sc
    lim = rules.credit_limit(sid)
    stand = rules.academic_standing(sid)
    paper = rules.paper_registration(sid)
    plan = planner.build_graduation_plan(sid, sc["target"], sc["summer"])
    opts = planner.plan_options(sid)
    table = {}
    for o in opts.get("options", []):
        for key in ("without_summer", "with_summer"):
            c = o[key]
            table[f"{o['target_years']}|{key}"] = {"status": c["status"],
                                                    "graduation": (c["graduation_term"] or {}).get("ar")}
    return {
        "credit_limit": {"max": lim.get("max_credits"), "why": lim.get("explanation")},
        "standing": {"on_warning": stand.get("on_warning"), "streak": stand.get("consecutive_warning_semesters"),
                     "text": stand.get("explanation"), "last_chance": stand.get("last_chance")},
        "paper": [{"case": c["case"], "text": c["explanation"]} for c in paper.get("cases", [])
                  if c["applies"] and c["case"] != "system_closed"],
        "plan": {"status": plan.get("status"), "feasible": plan.get("feasible"),
                 "graduation": (plan.get("graduation_term") or {}).get("ar"),
                 "explanation": plan.get("explanation"), "summer_courses": plan.get("summer_courses", []),
                 "college_requests": plan.get("college_requests", [])},
        "targets": table,
    }


def consistency(st: Student, said: dict) -> list[str]:
    """Masari's answers against the checker's own reading of the rules."""
    issues = []
    cap = expected_cap(st.cgpa(), st.main_done)
    if said["credit_limit"]["max"] != cap:
        issues.append(f"حد الساعات اللي مساري قاله {said['credit_limit']['max']} والمتوقع {cap}")
    cgpa = st.cgpa()
    warned = (cgpa is not None and cgpa < R["warning_gpa_threshold"]
              and st.main_done >= R["warning_starts_after_main_semester"])
    if bool(said["standing"]["on_warning"]) != warned:
        issues.append(f"الإنذار: مساري قال {said['standing']['on_warning']} والمتوقع {warned}")
    return issues


# ---------------------------------------------------------------- one journey

def needs_summer(plan: dict) -> bool:
    return any(c.get("kind") == "summer" for c in plan.get("conditions", []))


def plan_without_summer(sid: str, target, failed, term_gpa) -> dict:
    """The plan for a student who does not attend summer: the target if it works without summer, else the
    nearest later target that does (the planner's route for the target itself would need a summer)."""
    p = planner.build_graduation_plan(sid, target, False, failed, term_gpa, with_risk=False)
    for later in [y for y in planner.TARGETS if y > target]:
        if not needs_summer(p):
            break
        p = planner.build_graduation_plan(sid, later, False, failed, term_gpa, with_risk=False)
    return p


def next_registration(st: Student, plan: dict, sc: dict):
    """(year, term, courses, plan row, courses the system refuses) the student registers next, following the
    plan after the results. When a summer the plan counted on did not open, the registration system refuses
    the courses whose prerequisites were in that summer (the plan is asked again next term)."""
    summer_missed = False
    for row in plan.get("terms", []):
        codes = [c["code"] for c in row["courses"]]
        if row["term"] == "summer":
            taken = [c["code"] for c in row["courses"]
                     if c["flag"] == "training_summer" or (c["flag"] == "summer_on_demand" and sc["summer_opens"])]
            summer_missed |= len(taken) < len(codes)
            if not taken:
                continue
            codes = taken
        refused, deferred = [], []
        cap = sc.get("max_load")
        if cap and row["term"] != "summer":
            codes.sort(key=lambda c: (COURSES[c]["planned_semester"] or 99, c))
            keep, load = [], 0
            for c in codes:
                if load + COURSES[c]["credits"] <= cap:
                    keep.append(c)
                    load += COURSES[c]["credits"]
            for c in sorted((c for c in codes if c not in keep), key=lambda c: COURSES[c]["credits"]):
                if load >= R["min_credits_main_semester"]:
                    break
                keep.append(c)  # the 12-hour minimum comes first
                load += COURSES[c]["credits"]
            deferred = [c for c in codes if c not in keep]
            codes = keep
        if summer_missed:
            passed, earned = st.passed(), st.earned()
            refused = [c for c in codes if any(p not in passed for p in d.prereqs(COURSES[c]))
                       or earned < d.hours_needed(COURSES[c])[1]]
            codes = [c for c in codes if c not in refused]
        year = int(row["academic_year"].split("-")[0]) + (0 if row["term"] == "fall" else 1)
        return year, row["term"], codes, row, refused, summer_missed, deferred
    return None


def journey(sc: dict) -> dict:
    st = Student(sc)
    d.students = lambda: {st.sid: st.record()}  # the tools read this student only
    if not sc.get("base"):
        first = sorted(c["code"] for c in COURSES.values() if c["planned_semester"] == 1)
        st.register(ENROLLED, "fall", first)
    steps, outcome, main_sem = [], None, st.main_done + 1
    for _ in range(MAX_TERMS):
        cur = st.terms[-1]
        codes = [c["code"] for c in cur["courses"]]
        said = ask(st)  # during the term, before the results
        issues = st.pending + consistency(st, said)
        results = st.decide(main_sem)
        failed = [c for c, r in results.items() if r["grade"] in ("F", "FP")]
        graded_hours = sum(COURSES[c]["credits"] for c in codes if COURSES[c].get("graded", True) and COURSES[c]["credits"])
        term_points = sum(GP[r["grade"]] * COURSES[c]["credits"] for c, r in results.items() if r["grade"] in GP)
        term_gpa = round(term_points / graded_hours, 2) if graded_hours else None
        after = (planner.build_graduation_plan(st.sid, sc["target"], True, failed, term_gpa, with_risk=False)
                 if sc["summer"] else plan_without_summer(st.sid, sc["target"], failed, term_gpa))
        # If the college does not open summers, the same question without summer (asked now: the plan needs the
        # current term in progress).
        again = (plan_without_summer(st.sid, sc["target"], failed, term_gpa)
                 if sc["summer"] and not sc["summer_opens"] else None)
        summary = st.publish(results)
        step = {
            "term": when(cur["term"], cur["academic_year"]), "kind": cur["term"],
            "main_semester": main_sem if cur["term"] != "summer" else None,
            "registered": [{"code": c, "credits": COURSES[c]["credits"], "grade": results[c]["grade"]} for c in codes],
            "hours": sum(COURSES[c]["credits"] for c in codes), "failed": failed,
            "term_gpa": summary["term_gpa"], "cgpa": summary["cumulative_gpa"], "earned": summary["cumulative_earned_hours"],
            "standing": summary.get("academic_standing"), "masari": said,
            "issues": issues,
        }
        steps.append(step)
        if cur["term"] != "summer":
            main_sem += 1
        if cur["term"] != "summer" and st.chance is not None:
            if st.cgpa() >= R["warning_gpa_threshold"]:
                step["changes"] = ["عدّى 2.00 في الفرصة الأخيرة، فكمّل"]
                st.chance = None
            else:
                st.chance -= 1
        if st.streak >= R["dismissal_after_consecutive_low_semesters"] and not st.chance:
            d.students = lambda: {st.sid: st.record()}
            stand = rules.academic_standing(st.sid)
            lc = stand.get("last_chance") or {}
            if sc.get("council") and st.chance is None and lc.get("meets_hours_condition"):
                st.chance = lc.get("terms", 2)
                step["changes"] = [f"مجلس الكلية إدّاه فرصة أخيرة ({st.chance} فصل) لأنه ناجح في {lc['earned_hours']} ساعة "
                                   f"(الشرط {lc['required_earned_hours']})"]
            else:
                why = "وخلصت الفرصة الأخيرة من غير ما يعدّي 2.00. " if st.chance == 0 else ""
                outcome = {"kind": "dismissed", "text": f"اتفصل بعد {st.streak} ترمات إنذار ورا بعض. {why}" + stand.get("explanation", "")}
                break
        if st.done() and st.cgpa() >= R["graduation"]["min_cgpa"]:
            outcome = {"kind": "graduated", "text": f"اتخرج في {step['term']} بمعدل {st.cgpa()}"}
            break
        if st.done():
            step["changes"] = step.get("changes", []) + [
                f"خلّص كل المواد بس معدله {st.cgpa()} أقل من 2.00، فمساري قاله يحسّن مواد"]
        nxt = next_registration(st, after, sc)
        if (not nxt or nxt[5]) and sc["summer"] and not sc["summer_opens"]:
            # The summer the plan counted on did not open: follow the plan without summer.
            alt = next_registration(st, again, sc)
            if alt and (not nxt or not alt[5]):
                nxt, after = alt, again
        if not nxt:
            outcome = {"kind": "no_plan", "text": "الخطة مرجّعتش ترم جاي. " + (after.get("explanation") or after.get("error", ""))}
            break
        year, term, codes, row, refused, _, deferred = nxt
        is_last = row is (after.get("terms") or [None])[-1]
        improving = {c["code"] for c in row["courses"] if c.get("flag") == "improvement"}
        issues = check_registration(st, codes, term, is_last or bool(row.get("warning")), improving)
        flags = []
        if row.get("warning"):
            flags.append(row["warning"])
        if refused:
            flags.append("السيستم مش هيسمح بـ " + "، ".join(refused) + " لأن متطلبها كان في الصيفي اللي متفتحش")
        if improving:
            flags.append("تحسين: " + "، ".join(f"{c['code']} (كان {c.get('current_grade')})" for c in row["courses"]
                                             if c["code"] in improving))
        if row.get("paper_load"):
            flags.append(row["paper_load_ar"])
        if row.get("below_minimum_paper"):
            flags.append(row["below_minimum_ar"])
        flags += [c["paper_note_ar"] for c in row["courses"] if c.get("paper_registration") and c["code"] in codes]
        flags += [f"{c['code']}: {c['flag_ar']}" for c in row["courses"]
                  if c["flag"] in ("college_request", "graduation_request") and c["code"] in codes]
        if deferred:
            flags.append(f"سجّل {sum(COURSES[c]['credits'] for c in codes)} ساعة بس بمزاجه، وأجّل: " + "، ".join(deferred))
        skipped = [c["code"] for c in row["courses"] if c["code"] not in codes and c["code"] not in deferred + refused]
        if skipped:
            flags.append("الكلية مفتحتش في الصيفي: " + "، ".join(skipped))
        st.register(year, term, codes)
        st.pending = issues
        step["next"] = {"term": when(term, gen.term_label(year, term)), "courses": codes,
                        "hours": sum(COURSES[c]["credits"] for c in codes), "flags": flags}
        d.students = lambda: {st.sid: st.record()}
    for s in steps:
        s.setdefault("changes", [])
    prev = None
    for s in steps:
        g = plain(s["masari"]["plan"]["graduation"])
        if prev is not None and g != prev:
            s["changes"].append(f"التخرج المتوقع اتغير من {prev} لـ {g}")
        prev = g
    return {"key": sc["key"], "sid": sc["sid"], "student": sc["student"], "name": sc["name"],
            "demo": bool(sc.get("base")), "enrolled": st.enrolled,
            "started_at": (sc["base"]["academic_status"]["main_semesters_completed"] + 1) if sc.get("base") else 1,
            "total_mains": st.main_done,
            "total_summers": sum(1 for t in st.terms if t["term"] == "summer"
                                 and any(c["credits"] for c in t["courses"])),
            "total_trainings": sum(1 for t in st.terms if t["term"] == "summer"
                                   and not any(c["credits"] for c in t["courses"])),
            "story": sc["story"], "expect": sc["expect"],
            "target": sc["target"], "summer": sc["summer"], "summer_opens": sc["summer_opens"],
            "steps": steps, "outcome": outcome or {"kind": "timeout", "text": "وقف بعد أقصى عدد ترمات."}}


# ---------------------------------------------------------------- report

CSS = """
:root{--bg:#f7f7f5;--card:#fff;--ink:#1d1d1b;--muted:#6b6b66;--line:#e4e3de;--ok:#1f7a4d;--warn:#b25e00;--bad:#b3261e;
--chip:#efeee9;--accent:#3550c8}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#161615;--card:#1f1f1d;--ink:#ecebe6;--muted:#a3a29b;
--line:#33332f;--ok:#5cc28d;--warn:#f0a44a;--bad:#f2867e;--chip:#2a2a27;--accent:#8ea0ff}}
:root[data-theme="dark"]{--bg:#161615;--card:#1f1f1d;--ink:#ecebe6;--muted:#a3a29b;--line:#33332f;--ok:#5cc28d;--warn:#f0a44a;
--bad:#f2867e;--chip:#2a2a27;--accent:#8ea0ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 "Segoe UI",Tahoma,sans-serif}
main{max-width:1200px;margin:auto;padding:24px 16px 64px}h1{font-size:26px;margin:0 0 4px}h2{font-size:20px;margin:0}
.sub{color:var(--muted);margin:0 0 20px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;
padding:18px;margin:18px 0}.meta{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.chip{background:var(--chip);
border-radius:99px;padding:2px 10px;font-size:13px}.box{border-inline-start:3px solid var(--accent);padding:4px 12px;
margin:10px 0;color:var(--ink)}.box b{color:var(--muted);font-weight:600}.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:13.5px;min-width:900px}th,td{border-bottom:1px solid var(--line);
padding:8px 6px;text-align:start;vertical-align:top}th{color:var(--muted);font-weight:600;white-space:nowrap}
.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad);font-weight:600}.small{font-size:12.5px;color:var(--muted)}
.out{font-weight:600;margin-top:10px}.sum td{white-space:nowrap}details summary{cursor:pointer;color:var(--accent)}
"""


TERM_WORD = {"fall": "خريف", "spring": "ربيع", "summer": "صيفي"}
_PLAN_TERM = {"الخريف": "fall", "الربيع": "spring", "الصيفي": "summer"}


def when(term: str, academic_year: str) -> str:
    """'fall', '2029-2030' -> 'خريف 2029' (the calendar year the term falls in)."""
    start = int(academic_year.split("-")[0])
    return f"{TERM_WORD[term]} {start if term == 'fall' else start + 1}"


def plain(text):
    """The planner's 'الربيع 2029-2030' -> 'ربيع 2030' inside any text."""
    if not text:
        return text
    return re.sub(r"(الخريف|الربيع|الصيفي) (\d{4})-(\d{4})", lambda m: when(_PLAN_TERM[m[1]], f"{m[2]}-{m[3]}"), text)


def named(text):
    """'CSE 452' -> its Arabic name, inside any text."""
    if not text:
        return text
    return re.sub(r"\b([A-Z]{3}) (\d{3})\b",
                  lambda m: COURSES.get(m[0], {}).get("name_ar", m[0]), str(text))


def esc(x) -> str:
    return html.escape(str(x)) if x is not None else "—"


def report(journeys: list[dict]) -> str:
    total_issues = sum(len(s["issues"]) for j in journeys for s in j["steps"])
    rows = []
    for j in journeys:
        n = sum(len(s["issues"]) for s in j["steps"])
        mains = j["total_mains"]
        years = f"{mains / 2:g} سنين" if j["outcome"]["kind"] == "graduated" else "—"
        summers = f"{j['total_summers']} صيفي بمواد" + (f" + {j['total_trainings']} تدريب صيفي" if j["total_trainings"] else "")
        rows.append(f"<tr><td><a href='#{j['key']}'>{esc(j['student'])}</a><br><span class='small'>{esc(j['sid'])} · {esc(j['name'])}</span></td>"
                    f"<td>{esc(plain(j['outcome']['text']))}</td>"
                    f"<td>{mains} ترم<br><span class='small'>{years}</span></td><td class='small'>{summers}</td>"
                    f"<td class='{'bad' if n else 'ok'}'>{n or '✓'}</td></tr>")
    parts = [f"""<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>رحلات الطلاب</title><style>{CSS}</style></head>
<body><main><h1>رحلات الطلاب في مساري</h1>
<p class="sub">طلاب وهميين بيعيشوا ترم ورا ترم، وفي كل ترم بنسأل مساري (حد الساعات، الإنذار، الورقي، خطة التخرج).
الخانات اللي باللون الأحمر قاعدة اتكسرت حسب فحص مستقل من أرقام اللائحة. عمود "المتوقع" تحت كل طالب لازم حد بيفهم اللائحة يراجعه.</p>
<div class="card scroll"><table class="sum"><tr><th>الطالب</th><th>النهاية</th><th>ترمات أساسية من أول ما التحق</th><th>الصيفي</th><th>مشاكل</th></tr>
{''.join(rows)}</table><p class="small">إجمالي المشاكل: {total_issues}</p></div>"""]
    for j in journeys:
        if j is journeys[0] and j["demo"]:
            parts.append("<h1 style='margin-top:32px'>الطلاب الستة بتوعنا</h1><p class='sub'>نفس الطلاب اللي في الموقع، "
                         "من مكانهم دلوقتي (خريف 2026) لحد التخرج، بنفس مستوى درجاتهم. داتاهم الأصلية متغيرتش.</p>")
        if not j["demo"] and (j is journeys[0] or journeys[journeys.index(j) - 1]["demo"]):
            parts.append("<h1 style='margin-top:32px'>طلاب الاختبار</h1><p class='sub'>طلاب جداد من أول ترم، "
                         "كل واحد معمول عشان يختبر حالة معينة.</p>")
        parts.append(f"""<div class="card" id="{j['key']}"><h2>🎓 {esc(j['student'])}</h2>
<div class="small">رقم الطالب {esc(j['sid'])} · <b>{esc(j['name'])}</b> · التحق خريف {j['enrolled']}</div>
<div class="meta"><span class="chip">من أول ما التحق: {j['total_mains']} ترم أساسي{(' (' + format(j['total_mains'] / 2, 'g') + ' سنين)') if j['outcome']['kind'] == 'graduated' else ''}</span>
<span class="chip">{j['total_summers']} صيفي بمواد</span>{f"<span class='chip'>{j['total_trainings']} تدريب صيفي</span>" if j['total_trainings'] else ''}
{f"<span class='chip'>كان في الترم {j['started_at']} في خريف 2026، والجدول تحت من هناك</span>" if j['demo'] else ''}</div>
<div class="meta"><span class="chip">الهدف: {esc(j['target'])} سنين</span><span class="chip">صيفي: {'أيوه' if j['summer'] else 'لأ'}</span>
<span class="chip">الكلية بتفتح الصيفي: {'أيوه' if j['summer_opens'] else 'لأ'}</span></div>
<div class="box"><b>الحكاية:</b> {esc(named(j['story']))}</div><div class="box"><b>المتوقع (للمراجعة):</b> {esc(named(j['expect']))}</div>
<div class="scroll"><table><tr><th>رقم الترم</th><th>الترم</th><th>سجّل</th><th>النتيجة</th><th>المعدل</th><th>الحالة</th>
<th>حد الساعات (مساري)</th><th>الورقي (مساري)</th><th>التخرج المتوقع (مساري)</th><th>الترم الجاي</th><th>ملاحظات</th></tr>""")
        for s in j["steps"]:
            m = s["masari"]
            reg = "، ".join(named(r["code"]) for r in s["registered"])
            fails = ("<span class='bad'>سقط في: " + esc("، ".join(named(c) for c in s["failed"])) + "</span>") if s["failed"] else "<span class='ok'>نجح في الكل</span>"
            st = s["standing"] or "—"
            st_cls = "warn" if st == "إنذار أكاديمي" else ""
            paper = "<br>".join(esc(named(p["text"].split(" فإنت محتاج")[0])) for p in m["paper"]) or "—"
            plan = m["plan"]
            plan_cls = {"feasible": "ok", "conditional": "warn"}.get(plan["status"], "bad")
            plan_txt = f"<span class='{plan_cls}'>{esc(plain(plan['graduation']))}</span><details><summary>التفاصيل</summary>{esc(named(plain(plan['explanation'])))}</details>"
            nxt = s.get("next")
            nxt_txt = (f"{esc(nxt['term'])}: {nxt['hours']} ساعة<br><span class='small'>{esc('، '.join(named(c) for c in nxt['courses']))}</span>"
                       + "".join(f"<br><span class='warn'>{esc(named(f))}</span>" for f in nxt["flags"])) if nxt else "—"
            notes = "".join(f"<div class='bad'>⚠ {esc(named(i))}</div>" for i in s["issues"])
            notes += "".join(f"<div class='warn'>{esc(c)}</div>" for c in s["changes"])
            hours = f"{s['hours']} ساعة" if s["hours"] else "تدريب"
            num = s["main_semester"] if s["main_semester"] else "صيفي"
            parts.append(f"<tr><td>{num}</td><td>{esc(s['term'])}</td><td>{hours}<br><span class='small'>{esc(reg)}</span></td>"
                         f"<td>{fails}</td><td>ترم {esc(s['term_gpa'])}<br>تراكمي {esc(s['cgpa'])}<br><span class='small'>{s['earned']} ساعة</span></td>"
                         f"<td class='{st_cls}'>{esc(st)}</td><td>{esc(m['credit_limit']['max'])}</td><td class='small'>{paper}</td>"
                         f"<td>{plan_txt}</td><td>{nxt_txt}</td><td>{notes or '—'}</td></tr>")
        cls = {"graduated": "ok", "dismissed": "bad"}.get(j["outcome"]["kind"], "warn")
        parts.append(f"</table></div><p class='out {cls}'>النهاية: {esc(j['outcome']['text'])}</p></div>")
    parts.append("</main></body></html>")
    return "".join(parts)


DEMO_TARGET = {"excellent": 4, "near_graduation": 5}


def demo_scenarios(demo: dict) -> list[dict]:
    """The six students of ai/data/students.json, continued from their current term with their own grade level."""
    out = []
    for i, pers in enumerate(gen.PERSONAS, 1):
        s = next(x for x in demo.values() if x["persona"] == pers["key"])
        note = re.sub(r" ?[A-Z]{3} \d{3}", "", s["persona_note"])  # the notes name the course and add its code
        out.append(dict(
            key=f"demo_{pers['key']}", sid=s["student_id"], student=s["personal"]["name_ar"], name=note.split(":")[0],
            target=DEMO_TARGET.get(pers["key"], 5), summer=True, summer_opens=True, base=s,
            enrolled=int(s["enrollment"]["enrollment_year"].split("-")[0]),
            grades=[(1, pers["mean"], pers["sd"])],
            story=note + " ونكمّل من الترم الحالي بنفس مستوى درجاته لحد التخرج.",
            expect="نفس اللي في الموقع النهارده، وبعدين الخطة تتغير مع كل ترم حسب النتيجة."))
    return out


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    original = d.students
    journeys = []
    for sc in demo_scenarios(original()) + SCENARIOS:
        j = journey(sc)
        journeys.append(j)
        n = sum(len(s["issues"]) for s in j["steps"])
        print(f"{sc['key']:<16} {len(j['steps']):>2} terms  issues={n:<3} {j['outcome']['text']}")
    d.students = original
    OUT.mkdir(exist_ok=True)
    (OUT / "journeys.json").write_text(json.dumps(journeys, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "report.html").write_text(report(journeys), encoding="utf-8")
    print(f"wrote {OUT / 'report.html'}")


if __name__ == "__main__":
    main()
