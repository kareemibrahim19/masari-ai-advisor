"""Rule tools: everything the chatbot can compute about a student from the regulations.

Per the project rule "fixed rules are computed by code, not by the LLM", each function returns plain
numbers and verdicts (with the regulation article) and the model only explains them to the student.
All of them return JSON-serializable dicts; an unknown student or course gives {"found": False, "error": ...}.
"""

import math

from . import _data as d

ARTICLES = {"load": "مادة 13", "drop": "مادة 15", "retake": "مادة 15", "training": "مادة 17", "elective": "مادة 18",
            "concurrent": "مادة 19", "grades": "مادة 21", "warning": "مادة 25", "attendance": "مادة 12",
            "improve": "مادة 30", "project": "مادة 16"}


# The regulations give limits by GPA only; a student with no GPA yet (first term) gets 18, the same value the
# website's rules engine (frontend/src/lib/rules.ts) uses, so the chat and the pages never disagree.
FIRST_TERM_MAX_LOAD = 18


def _student(student_id: str):
    s = d.get_student(student_id)
    return (s, None) if s else (None, d.not_found("الطالب", student_id))


def _on_warning(cgpa, main_done: int) -> bool:
    r = d.rules()
    return (cgpa is not None and cgpa < r["warning_gpa_threshold"]
            and main_done >= r["warning_starts_after_main_semester"])


def _current_term(student: dict) -> dict | None:
    return next((t for t in student["terms"] if t["status"] == "in_progress"), None)


def _registered_hours(student: dict) -> int:
    return sum(c["credits"] for c in d.current_courses(student))


# ---------------------------------------------------------------- 1. credit limit

def credit_limit(student_id: str, term_type: str = "main") -> dict:
    """Max / min credit hours the student may register this term (article 13) and what is left."""
    s, err = _student(student_id)
    if err:
        return err
    r, st = d.rules(), s["academic_status"]
    cgpa, main_done = st["cumulative_gpa"], st["main_semesters_completed"]
    registered = _registered_hours(s)

    if term_type == "summer":
        return {"found": True, "term_type": "summer", "max_courses": r["summer"]["max_courses"],
                "projects_allowed": r["summer"]["projects_allowed"], "article": ARTICLES["load"],
                "explanation": f"في الصيفي الحد الأقصى {r['summer']['max_courses']} مواد ومينفعش تسجل مشاريع."}

    warned = _on_warning(cgpa, main_done)
    if cgpa is None:
        limit, why = FIRST_TERM_MAX_LOAD, f"أول فصل دراسي ومفيش معدل تراكمي لسه، فالحد الأقصى {FIRST_TERM_MAX_LOAD} ساعة."
    elif warned:
        limit = r["probation_max_credits"]
        why = f"الطالب تحت الإنذار الأكاديمي (معدله {cgpa} أقل من 2.00)، فالحد الأقصى {limit} ساعة."
    else:
        band = next(b for b in r["max_credits_by_gpa"] if b["gpa_min"] <= cgpa < b["gpa_max"])
        limit = band["max_credits"]
        why = f"معدله التراكمي {cgpa} فالحد الأقصى {limit} ساعة."
    return {"found": True, "term_type": "main", "cumulative_gpa": cgpa, "on_warning": warned,
            "max_credits": limit, "min_credits": r["min_credits_main_semester"],
            "registered_hours": registered, "remaining_hours": max(0, limit - registered),
            "article": ARTICLES["load"], "explanation": why}


# ---------------------------------------------------------------- 2. warning and dismissal

def academic_standing(student_id: str) -> dict:
    """Is the student on academic warning, and how close is dismissal (article 25)."""
    s, err = _student(student_id)
    if err:
        return err
    r, st = d.rules(), s["academic_status"]
    cgpa, main_done = st["cumulative_gpa"], st["main_semesters_completed"]
    streak = st["consecutive_warning_semesters"]
    warned = _on_warning(cgpa, main_done)
    limit = r["dismissal_after_consecutive_low_semesters"]
    out = {"found": True, "cumulative_gpa": cgpa, "main_semesters_completed": main_done,
           "standing": "إنذار أكاديمي" if warned else "منتظم", "on_warning": warned,
           "consecutive_warning_semesters": streak, "dismissal_after_consecutive_semesters": limit,
           "warning_threshold": r["warning_gpa_threshold"], "article": ARTICLES["warning"]}
    if cgpa is None:
        out["explanation"] = "لسه مفيش معدل تراكمي، فمفيش إنذار."
    elif warned:
        left = limit - streak
        out["terms_left_before_dismissal"] = left
        out["explanation"] = (f"معدله {cgpa} أقل من 2.00 فهو تحت الإنذار، وده الفصل رقم {streak} المتتالي. "
                              f"لو فضل المعدل أقل من 2.00 لـ {left} فصل كمان هيتفصل.")
    elif cgpa < r["warning_gpa_threshold"]:
        out["explanation"] = (f"معدله {cgpa} أقل من 2.00 بس لسه قبل الترم الأساسي التاني "
                              f"(الإنذار بيبدأ بعده)، فمفيش إنذار دلوقتي.")
    else:
        out["explanation"] = f"معدله {cgpa} فوق 2.00 فهو منتظم ومفيش إنذار."
    # Article 25 item 5: a student facing dismissal may get one last chance (decided by the Faculty Council).
    if warned and streak >= limit - 1:
        need = math.ceil(d.program()["program"]["total_credits"] * 0.8)
        have = st["earned_hours"]
        out["last_chance"] = {
            "council_decides": True, "required_earned_hours": need, "earned_hours": have,
            "meets_hours_condition": have >= need, "terms": 2, "article": ARTICLES["warning"]}
        out["explanation"] += (
            f" ممكن مجلس الكلية يدّيه فرصة أخيرة واحدة لفصلين رئيسيين يرفع فيهم المعدل لـ 2.00، بشرط يكون نجح في "
            f"80% من ساعات التخرج ({need} ساعة)، وهو ناجح في {have} ساعة"
            + (" وده محقق الشرط." if have >= need else " وده لسه مش محقق الشرط.")
            + " والقرار للمجلس ومش مضمون.")
    out["max_study_years"] = r["max_study_years"]
    return out


# ---------------------------------------------------------------- 3. GPA

def gpa_calculator(student_id: str) -> dict:
    """Cumulative GPA recomputed from the latest attempt of every graded course, plus each term's GPA."""
    s, err = _student(student_id)
    if err:
        return err
    gp = d.rules()["grade_points"]
    graded = [a for a in d.best_attempts(s).values() if a["grade"] in gp]
    hours = sum(a["credits"] for a in graded)
    points = sum(gp[a["grade"]] * a["credits"] for a in graded)
    terms = [{"academic_year": t["academic_year"], "term_ar": t["term_ar"], **{
        k: t["summary"][k] for k in ("registered_hours", "earned_hours", "term_gpa", "cumulative_gpa")}}
        for t in s["terms"] if t["status"] == "published" and t.get("summary", {}).get("registered_hours")]
    return {"found": True, "cumulative_gpa": round(points / hours, 2) if hours else None,
            "graded_hours": hours, "quality_points": round(points, 2), "terms": terms,
            "how": "المعدل = مجموع (نقاط التقدير × ساعات المادة) ÷ مجموع الساعات. بيتحسب بآخر محاولة لكل مادة، "
                   "ومواد النجاح/الرسوب (زي التدريب) مش داخلة.",
            "article": ARTICLES["grades"]}


# ---------------------------------------------------------------- 4. retake / improvement

def _attempts_of(student: dict, code: str) -> list[dict]:
    return [c for t in student["terms"] if t["status"] == "published" for c in t["courses"] if c["code"] == code]


def retake_info(student_id: str, course_code: str) -> dict:
    """Retake of a failed course (article 15) or improvement of a passed one (article 30)."""
    s, err = _student(student_id)
    if err:
        return err
    course = d.find_course(course_code)
    if not course:
        return d.not_found("المادة", course_code)
    r, code = d.rules(), course["code"]
    attempts = _attempts_of(s, code)
    base = {"found": True, "course": d.course_label(code), "attempts": [
        {"academic_year": t["academic_year"], "term_ar": t["term_ar"], "grade": c["grade"], "total": c["total"]}
        for t in s["terms"] if t["status"] == "published" for c in t["courses"] if c["code"] == code]}
    in_progress = any(c["code"] == code for c in d.current_courses(s))

    if not attempts:
        base.update(status="not_taken", explanation=("المادة دي مسجلة معاه الترم ده." if in_progress
                                                    else "لسه ماخدش المادة دي، فمفيش إعادة."))
        return base
    last = attempts[-1]
    if last["grade"] in ("FP",) or (course.get("graded") is False and last["grade"] != "P"):
        base.update(status="must_retake", article=ARTICLES["training"],
                    explanation="التدريب نجاح/رسوب، ولازم يعيده لحد ما ينجح عشان يتخرج (مادة 17).")
        return base
    if last["grade"] == "F":
        cap = r["retake_max_grade"]
        text = (f"راسب في المادة (F) ولازم يعيدها. أقصى تقدير بعد الإعادة {cap}. "
                f"هيحضر المادة ويعيد الامتحان حسب اللوائح المالية (مادة 15).")
        if course["type"] == "elective":
            text += (" وهي اختيارية: لو أعاد نفس المادة تقديره الأقصى هو الأقل بين التقديرين، "
                     "ولو غيّرها لمادة اختيارية تانية بياخد درجتها زي ما هي.")
        base.update(status="must_retake", max_grade_after_retake=cap, article=ARTICLES["retake"], explanation=text)
        return base

    # Passed: it can only be an improvement. Count improvements used = repeats of an already passed course.
    used = 0
    for code2 in {c["code"] for t in s["terms"] if t["status"] == "published" for c in t["courses"]}:
        rows = _attempts_of(s, code2)
        used += sum(1 for i in range(1, len(rows)) if rows[i - 1]["grade"] not in ("F", "FP"))
    imp = r["improvement"]
    left = imp["max_courses"] - used
    base.update(status="passed", current_grade=last["grade"], improvements_used=used, improvements_left=left,
                article=ARTICLES["improve"],
                explanation=(f"ناجح في المادة بتقدير {last['grade']}. التحسين متاح في {imp['max_courses']} مواد "
                             f"على مدار الدراسة (استخدم {used}، فاضل {left})، والتقدير الأخير هو اللي بيتحسب. "
                             f"ومينفعش ينسحب من المادة بعد الأسبوع الرابع لأن ده بيمحو التقدير الأول. "
                             f"ومينفعش يحسّن مادة كان دفع رسوم إعادة تسجيلها (مادة 30)."))
    if left <= 0:
        base["explanation"] = f"ناجح بتقدير {last['grade']}، لكن استخدم كل مرات التحسين الـ {imp['max_courses']} (مادة 30)."
    return base


# ---------------------------------------------------------------- 5. course info

def course_info(query: str, student_id: str | None = None) -> dict:
    """Course data by code or name; with a student, also whether they passed / registered it."""
    c = d.find_course(query)
    if not c:
        return d.not_found("المادة", query)
    prereqs = [d.course_label(p) for p in c["prerequisites"]]
    pools = [p["level"] for p in d.program().get("elective_pools", []) if c["code"] in p["courses"]]
    out = {"found": True, "code": c["code"], "name_ar": c["name_ar"], "name_en": c.get("name_en"),
           "credits": c["credits"], "type": c["type"], "category": c["category"], "department": c["department"],
           "level": c["level"], "planned_semester": c["planned_semester"], "prerequisites": prereqs,
           "min_level_required": c.get("min_level_required"), "min_credits_required": c.get("min_credits_required"),
           "assessment": c.get("assessment"), "weekly_load_hours": c.get("weekly_load_hours"),
           "graded": c.get("graded", True), "elective_pool_level": pools[0] if pools else None}
    if student_id:
        s = d.get_student(student_id)
        if s:
            a = d.best_attempts(s).get(c["code"])
            registered = any(x["code"] == c["code"] for x in d.current_courses(s))
            out["student_status"] = ("مسجلها الترم ده" if registered else
                                     f"ناجح ({a['grade']})" if d.passed(a) else
                                     "راسب" if a else "لسه ماخدهاش")
    return out


# ---------------------------------------------------------------- 6. what a course unlocks

def course_unlocks(course_code: str) -> dict:
    """Courses that need this one as a prerequisite, directly and further down the chain."""
    c = d.find_course(course_code)
    if not c:
        return d.not_found("المادة", course_code)
    allc = d.courses()
    direct = [x["code"] for x in allc.values() if c["code"] in x["prerequisites"]]
    seen, frontier = set(direct), list(direct)
    while frontier:
        cur = frontier.pop()
        for x in allc.values():
            if cur in x["prerequisites"] and x["code"] not in seen:
                seen.add(x["code"])
                frontier.append(x["code"])
    indirect = sorted(seen - set(direct))
    label = lambda codes: [{"course": d.course_label(k), "planned_semester": allc[k]["planned_semester"]}
                           for k in sorted(codes)]
    return {"found": True, "course": d.course_label(c["code"]), "unlocks_directly": label(direct),
            "unlocks_later": label(indirect),
            "explanation": ("مفيش مواد بتتطلب المادة دي كمتطلب سابق." if not seen else
                            f"المادة دي متطلب سابق مباشر لـ {len(direct)} مادة، وبتفتح {len(indirect)} مادة تانية في السلسلة.")}


# ---------------------------------------------------------------- 7. academic level

def academic_level(student_id: str) -> dict:
    """Standing by earned hours (Freshman..Senior) and the hours left to the next level."""
    s, err = _student(student_id)
    if err:
        return err
    bands = d.rules()["standing_by_credits"]
    earned = s["academic_status"]["earned_hours"]
    cur = next(b for b in reversed(bands) if earned >= b["min"])
    nxt = next((b for b in bands if b["level"] == cur["level"] + 1), None)
    out = {"found": True, "earned_hours": earned, "level": cur["level"], "level_name": cur["name"],
           "course_level": cur["level"] * 100, "required_hours": d.program()["program"]["total_credits"]}
    if nxt:
        out["hours_to_next_level"] = nxt["min"] - earned
        out["next_level_name"] = nxt["name"]
        out["explanation"] = (f"مستواه {cur['level']} ({cur['name']}) بـ {earned} ساعة معتمدة، "
                              f"وفاضله {nxt['min'] - earned} ساعة للمستوى {nxt['level']} ({nxt['name']}).")
    else:
        out["explanation"] = f"مستواه {cur['level']} ({cur['name']}) وهو أعلى مستوى، وفاضله {out['required_hours'] - earned} ساعة للتخرج."
    return out


# ---------------------------------------------------------------- 8. electives

def elective_status(student_id: str) -> dict:
    """Electives passed / registered per level pool, what is still required and what can be picked."""
    s, err = _student(student_id)
    if err:
        return err
    best, now = d.best_attempts(s), {c["code"] for c in d.current_courses(s)}
    pools = []
    for p in d.program()["elective_pools"]:
        done = [k for k in p["courses"] if d.passed(best.get(k))]
        reg = [k for k in p["courses"] if k in now]
        left = max(0, p["choose"] - len(done) - len(reg))
        options = [k for k in p["courses"] if k not in done and k not in reg]
        pools.append({"level": p["level"], "must_choose": p["choose"], "slots": p["slots"],
                      "passed": [d.course_label(k) for k in done], "registered_now": [d.course_label(k) for k in reg],
                      "still_needed": left,
                      "available_options": [d.course_label(k) for k in options] if left else []})
    total_needed = d.program()["program"]["electives_required"]
    taken = sum(len(p["passed"]) + len(p["registered_now"]) for p in pools)
    return {"found": True, "electives_required_total": total_needed, "passed_or_registered": taken,
            "pools": pools, "article": ARTICLES["elective"],
            "explanation": f"مطلوب {total_needed} مواد اختيارية (مستوى 300: اتنين، مستوى 400: تلاتة)، خلّص أو سجّل {taken}."}


# ---------------------------------------------------------------- 9. attendance

def attendance_check(absent_hours: float | None = None, total_hours: float | None = None,
                     absence_pct: float | None = None) -> dict:
    """Where an absence rate stands against the 10% / 20% warnings and the 25% limit (article 12)."""
    a = d.rules()["attendance"]
    if absence_pct is None:
        if absent_hours is None or not total_hours:
            return {"found": False, "error": "محتاج نسبة الغياب، أو عدد ساعات الغياب وإجمالي ساعات المادة."}
        absence_pct = absent_hours / total_hours * 100
    limit, w1, w2 = a["max_absence_pct"], *a["warnings_at_pct"]
    if absence_pct > limit:
        status, text = "deprived", (f"نسبة الغياب {absence_pct:.1f}% عدّت {limit}%، فبيتسجل له تقدير محروم "
                                    f"وبيدخل في المعدل (مادة 12).")
    elif absence_pct > w2:
        status, text = "second_warning", f"نسبة الغياب {absence_pct:.1f}%: الإنذار التاني (بعد {w2}%). الحد النهائي {limit}%."
    elif absence_pct > w1:
        status, text = "first_warning", f"نسبة الغياب {absence_pct:.1f}%: الإنذار الأول (بعد {w1}%). الحد النهائي {limit}%."
    else:
        status, text = "ok", f"نسبة الغياب {absence_pct:.1f}% وده في الحدود الآمنة (الإنذار الأول بعد {w1}%)."
    out = {"found": True, "absence_pct": round(absence_pct, 1), "status": status, "max_absence_pct": limit,
           "warnings_at_pct": [w1, w2], "article": ARTICLES["attendance"], "explanation": text}
    if total_hours:
        out["max_absent_hours"] = math.floor(total_hours * limit / 100)
        out["hours_left_before_deprived"] = max(0, math.floor(total_hours * limit / 100) - (absent_hours or 0))
    return out


# ---------------------------------------------------------------- 10. drop / withdraw

def drop_withdraw_info(current_week: int, term_type: str = "main", student_id: str | None = None,
                       course_code: str | None = None) -> dict:
    """What the student can still do this week: drop (article 15 item 2) or withdraw with a W (item 3)."""
    r = d.rules()["add_drop_withdraw"]
    summer = term_type == "summer"
    withdraw_until = r["withdraw_until_week_summer"] if summer else r["withdraw_until_week"]
    can_drop = (not summer) and current_week <= r["drop_until_week"]
    can_withdraw = current_week <= withdraw_until
    if can_drop:
        text = (f"لسه في الأسبوع {current_week}: يقدر يحذف المادة (لحد نهاية الأسبوع {r['drop_until_week']}) "
                f"من غير ما تظهر في سجله، بموافقة المرشد الأكاديمي.")
    elif can_withdraw:
        text = (f"الحذف انتهى (كان لحد الأسبوع {r['drop_until_week']}). لسه يقدر ينسحب لحد نهاية الأسبوع "
                f"{withdraw_until}، والمادة بتتسجل W (منسحب)، بشرط ميكونش عدّى نسبة الغياب وبموافقة المرشد.")
    else:
        text = f"فات ميعاد الحذف والانسحاب (آخر ميعاد للانسحاب نهاية الأسبوع {withdraw_until})."
    if summer:
        text = ("في الصيفي: " + (f"يقدر ينسحب لحد نهاية الأسبوع {withdraw_until} والمادة بتتسجل W." if can_withdraw
                                else f"فات ميعاد الانسحاب (نهاية الأسبوع {withdraw_until})."))
    out = {"found": True, "current_week": current_week, "term_type": "summer" if summer else "main",
           "can_drop": can_drop, "can_withdraw": can_withdraw, "drop_until_week": None if summer else r["drop_until_week"],
           "withdraw_until_week": withdraw_until, "withdraw_grade": r["withdraw_grade"],
           "article": ARTICLES["drop"], "explanation": text,
           "note": "الحذف والانسحاب بيحتاجوا موافقة المرشد الأكاديمي ومينفعش يقللوا العبء عن الحد الأدنى 12 ساعة (مادة 13)، إلا في التخرج أو بموافقة المجلس الأكاديمي."}
    if student_id and course_code:
        s, c = d.get_student(student_id), d.find_course(course_code)
        if s and c:
            registered = _registered_hours(s)
            after = registered - c["credits"]
            minimum = d.rules()["min_credits_main_semester"]
            out["hours_after"] = after
            out["keeps_minimum_load"] = after >= minimum or summer
            if not out["keeps_minimum_load"]:
                out["note"] += f" ملحوظة: بعد الحذف هيبقى {after} ساعة وده أقل من الحد الأدنى {minimum}."
    return out


# ---------------------------------------------------------------- 11. registration eligibility

def registration_eligibility(student_id: str, course_code: str, term_type: str = "current") -> dict:
    """Can this student register this course now? Runs every registration rule and lists each check."""
    s, err = _student(student_id)
    if err:
        return err
    c = d.find_course(course_code)
    if not c:
        return d.not_found("المادة", course_code)
    r, st = d.rules(), s["academic_status"]
    code, best = c["code"], d.best_attempts(s)
    cur = _current_term(s)
    term = cur["term"] if (term_type == "current" and cur) else term_type
    checks = []

    def add(name, ok, detail, article=None):
        checks.append({"check": name, "ok": ok, "detail": detail, **({"article": article} if article else {})})

    now_codes = {x["code"] for x in d.current_courses(s)}
    if code in now_codes and term == (cur or {}).get("term"):
        add("already_registered", False, "المادة مسجلة معاه الترم ده فعلًا.")
    prev = best.get(code)
    if d.passed(prev) and c.get("graded", True) is not False:
        add("not_passed_before", False, f"ناجح فيها قبل كده بتقدير {prev['grade']} (ممكن تحسين بس، مادة 30).", ARTICLES["improve"])
    else:
        add("not_passed_before", True, "مش ناجح فيها قبل كده." if not prev else "راسب فيها وده إعادة (أقصى تقدير B+).")

    # Term offering: plan semesters alternate fall / spring; electives run in both; trainings in summer.
    sem = c["planned_semester"]
    if c["type"] == "training":
        add("offered_this_term", term == "summer", "التدريب بيتعمل في الإجازة الصيفية." if term == "summer"
            else "التدريب بيتسجل في الصيفي بس.", ARTICLES["training"])
    elif term == "summer":
        add("offered_this_term", True, "الصيفي متاح فيه المواد اللي الكلية بتفتحها، بحد أقصى 3 مواد.")
    elif sem is not None:
        ok = (sem % 2 == 1) == (term == "fall")
        add("offered_this_term", ok, f"المادة في الترم {sem} من الخطة، وده ترم {'خريف' if sem % 2 else 'ربيع'}"
            + ("" if ok else " فمش بتتفتح في الترم ده."))
    if c["type"] == "project" and term == "summer":
        add("projects_not_in_summer", False, "المشاريع مينفعش تتسجل في الصيفي.", ARTICLES["project"])

    # Prerequisites (passed with at least a D) and the exception of article 19.
    missing = [p for p in c["prerequisites"] if not d.passed(best.get(p))]
    if missing:
        failed_before = [p for p in missing if best.get(p) and best[p]["grade"] == "F"]
        detail = "ناقصه المتطلبات: " + "، ".join(d.course_label(p) for p in missing)
        if failed_before and st["level"] >= 4:
            detail += " (مستوى رابع وساقط فيها، فممكن يسجلها بالتزامن بموافقة المجلس الأكاديمي — مادة 19)."
        add("prerequisites", False, detail, ARTICLES["concurrent"] if failed_before else None)
    elif c["prerequisites"]:
        add("prerequisites", True, "ناجح في كل المتطلبات السابقة: " + "، ".join(c["prerequisites"]))
    else:
        add("prerequisites", True, "مفيش متطلبات سابقة.")

    need_level = c.get("min_level_required")
    if need_level:
        ok = st["level"] * 100 >= need_level
        add("min_level", ok, f"محتاج مستوى {need_level // 100} وهو في مستوى {st['level']}.")
    need_hours = c.get("min_credits_required")
    if need_hours:
        add("min_credits", st["earned_hours"] >= need_hours,
            f"محتاج {need_hours} ساعة ناجح فيها، وعنده {st['earned_hours']}.")

    # Credit-limit headroom (only meaningful for the current main term).
    if term != "summer" and cur and term == cur["term"] and code not in now_codes:
        lim = credit_limit(student_id)
        fits = lim["registered_hours"] + c["credits"] <= lim["max_credits"]
        add("credit_limit", fits, f"مسجل {lim['registered_hours']} ساعة والحد الأقصى {lim['max_credits']}"
            + ("" if fits else f"، والمادة {c['credits']} ساعة فهتعدّي الحد."), ARTICLES["load"])
    failing = [k for k in checks if not k["ok"]]
    return {"found": True, "student_id": s["student_id"], "course": d.course_label(code), "term": term,
            "eligible": not failing, "checks": checks,
            "blockers": [k["detail"] for k in failing],
            "explanation": ("يقدر يسجل المادة." if not failing else "مينفعش يسجل المادة لأن: " + " | ".join(k["detail"] for k in failing))}
