"""Instructor tools: who teaches a course, what an instructor is like, and which one suits a student.

Data comes from ai/data/instructors.json (survey profile per instructor and per course offering) and
ai/data/student_instructor_history.json (which instructor each student took, with the grade). Both are
simulated today; the real survey data will have the same fields.

The recommendation has three bases, reported in `basis` so the UI can show where it comes from:
  surveys_only                no preferences and no grades yet (first-year student): survey quality only
  surveys_and_preferences     the student stated what they like (pace / workload / practical)
  surveys_and_performance     the student has graded courses: taste is inferred from the instructors they
                              did well with, and weak students are protected from very hard instructors
Today it is a transparent weighted score. The real model (XGBoost + SHAP) will replace `_score`
and keep the same output shape.
"""

from . import _data as d

DIMS = ("clarity", "pace", "workload", "practical", "difficulty", "satisfaction")
TASTE = ("pace", "workload", "practical")
SHRINK_K = 15          # responses a profile is "worth" of pulling toward the population mean
MIN_HISTORY = 3        # graded courses with known instructors before performance is used
FULL_HISTORY = 10      # graded courses at which the performance signal has full weight
DIM_AR = {"clarity": "وضوح الشرح", "pace": "سرعة الشرح", "workload": "العبء الدراسي",
          "practical": "الجانب العملي", "difficulty": "صعوبة التقييم", "satisfaction": "رضا الطلاب"}
BASIS_EN = {"surveys_only": "Based on past student evaluations",
            "surveys_and_preferences": "Based on student evaluations and your preferences",
            "surveys_and_performance": "Based on student evaluations and your past performance"}
BASIS_AR = {"surveys_only": "مبني على تقييمات الطلبة السابقين",
            "surveys_and_preferences": "مبني على تقييمات الطلبة وتفضيلاتك",
            "surveys_and_performance": "مبني على تقييمات الطلبة وأدائك السابق"}


# ---------------------------------------------------------------- data helpers

def _instructors() -> dict[str, dict]:
    return {i["id"]: i for i in d.instructor_data()["instructors"]}


def _offerings() -> list[dict]:
    return d.instructor_data()["offerings"]


def _population_mean() -> dict:
    off = _offerings()
    return {k: sum(o["profile"][k] for o in off) / len(off) for k in DIMS}


def confidence(n: int) -> str:
    return "high" if n >= 50 else "medium" if n >= 20 else "low"


def _shrunk(offering: dict) -> dict:
    """Pull a profile toward the population mean when it rests on few survey responses."""
    n, mean = offering["responses"], _population_mean()
    return {k: (n * offering["profile"][k] + SHRINK_K * mean[k]) / (n + SHRINK_K) for k in DIMS}


def _find_instructor(query: str) -> dict | None:
    people = _instructors()
    if query in people:
        return people[query]
    q = (query or "").replace("د.", "").replace("Dr.", "").strip().lower()
    if not q:
        return None
    for i in people.values():
        if q in i["name_ar"].replace("د.", "").lower() or q in i["name_en"].replace("Dr.", "").lower():
            return i
    return None


def _offering_for(course_code: str, instructor_id: str) -> dict | None:
    return next((o for o in _offerings() if o["course_code"] == course_code and o["instructor_id"] == instructor_id), None)


def _view(offering: dict) -> dict:
    ins = _instructors()[offering["instructor_id"]]
    return {"instructor_id": ins["id"], "name_ar": ins["name_ar"], "name_en": ins["name_en"],
            "course": d.course_label(offering["course_code"]), "section": offering["section"],
            "profile": offering["profile"], "responses": offering["responses"],
            "confidence": confidence(offering["responses"])}


# ---------------------------------------------------------------- who teaches / profile

def who_teaches(course_code: str, term: str | None = None) -> dict:
    """Instructors and sections available for a course (optionally only those offered in fall / spring)."""
    c = d.find_course(course_code)
    if not c:
        return d.not_found("المادة", course_code)
    rows = [o for o in _offerings() if o["course_code"] == c["code"]]
    if term in ("fall", "spring"):
        rows = [o for o in rows if o["offered_term"] in (term, "both")]
    if not rows:
        return {"found": True, "course": d.course_label(c["code"]), "sections": [],
                "explanation": "مفيش دكاترة مسجلين للمادة دي (ممكن تكون تدريب أو مشروع بإشراف)."}
    return {"found": True, "course": d.course_label(c["code"]), "sections": [_view(o) for o in rows],
            "explanation": f"المادة {d.course_label(c['code'])} بتدرّسها {len(rows)} شعب."}


def instructor_profile(instructor: str, course_code: str | None = None) -> dict:
    """What an instructor is like according to student surveys, overall and per course."""
    ins = _find_instructor(instructor)
    if not ins:
        return d.not_found("الدكتور", instructor)
    mean = _population_mean()
    offs = [o for o in _offerings() if o["instructor_id"] == ins["id"]]
    if course_code:
        code = (d.find_course(course_code) or {}).get("code")
        offs = [o for o in offs if o["course_code"] == code]
    prof = ins["profile"]
    strengths = [DIM_AR[k] for k in ("clarity", "satisfaction") if prof[k] >= mean[k] + 5]
    traits = []
    if prof["pace"] >= 70: traits.append("سرعة الشرح عالية")
    elif prof["pace"] <= 45: traits.append("شرحه هادي")
    if prof["practical"] >= 70: traits.append("عملي")
    elif prof["practical"] <= 40: traits.append("نظري")
    if prof["workload"] >= 70: traits.append("عبئه الدراسي تقيل")
    elif prof["workload"] <= 45: traits.append("عبئه خفيف")
    return {"found": True, "instructor_id": ins["id"], "name_ar": ins["name_ar"], "name_en": ins["name_en"],
            "department": ins["department"], "profile": prof, "responses": ins["responses"],
            "confidence": confidence(ins["responses"]), "strengths": strengths, "traits": traits,
            "courses": [{"course": d.course_label(o["course_code"]), "section": o["section"],
                         "profile": o["profile"], "responses": o["responses"],
                         "confidence": confidence(o["responses"])} for o in offs]}


# ---------------------------------------------------------------- student preferences

def _inferred_taste(student_id: str) -> tuple[dict | None, int]:
    """Taste from the instructors a student did well with: grade-weighted average of their profiles."""
    gp = d.rules()["grade_points"]
    rows = []
    for h in d.history_rows():
        if h["student_id"] != str(student_id) or h["grade"] not in gp:
            continue
        o = _offering_for(h["course_code"], h["instructor_id"])
        if o:
            rows.append((gp[h["grade"]], o["profile"]))
    if len(rows) < MIN_HISTORY:
        return None, len(rows)
    avg = sum(g for g, _ in rows) / len(rows)
    weights = [max(0.1, g - avg + 1) for g, _ in rows]
    total = sum(weights)
    return {k: sum(w * p[k] for w, (_, p) in zip(weights, rows)) / total for k in TASTE}, len(rows)


def student_preferences(student_id: str, pace: float | None = None, workload: float | None = None,
                        practical: float | None = None) -> dict:
    """What the student prefers: what they said (0-100 per dimension) and what their grades suggest."""
    stated = {k: v for k, v in (("pace", pace), ("workload", workload), ("practical", practical)) if v is not None}
    inferred, n = _inferred_taste(student_id)
    if stated and inferred:
        basis, effective = "surveys_and_performance", {**inferred, **stated}
    elif inferred:
        basis, effective = "surveys_and_performance", dict(inferred)
    elif stated:
        basis, effective = "surveys_and_preferences", dict(stated)
    else:
        basis, effective = "surveys_only", {}
    return {"found": True, "stated": stated, "inferred_from_performance": (
        {k: round(v) for k, v in inferred.items()} if inferred else None),
        "graded_courses_with_instructor": n, "effective": {k: round(v) for k, v in effective.items()},
        "basis": basis, "basis_ar": BASIS_AR[basis],
        "scale": "كل بُعد من 0 لـ 100: pace=سرعة الشرح، workload=العبء الدراسي، practical=الجانب العملي."}


# ---------------------------------------------------------------- scoring

def _fit(profile: dict, taste: dict) -> float | None:
    """0-100: how close an instructor is to the student's taste (workload only hurts when above it)."""
    parts = []
    if "pace" in taste:
        parts.append(100 - abs(profile["pace"] - taste["pace"]))
    if "workload" in taste:
        parts.append(100 - max(0, profile["workload"] - taste["workload"]) * 1.2)
    if "practical" in taste:
        parts.append(100 - abs(profile["practical"] - taste["practical"]))
    return sum(parts) / len(parts) if parts else None


def _score(offering: dict, taste: dict, basis: str, n_hist: int, cgpa: float | None) -> dict:
    p = _shrunk(offering)
    quality = 0.5 * p["clarity"] + 0.5 * p["satisfaction"]
    fit = _fit(p, taste) if basis != "surveys_only" else None
    if fit is None:
        score = quality
    else:
        fit_w = 0.6 if basis == "surveys_and_preferences" else 0.3 + 0.35 * min(1, n_hist / FULL_HISTORY)
        score = fit_w * fit + (1 - fit_w) * quality
    # A struggling student is steered away from very demanding instructors (performance signal).
    if basis == "surveys_and_performance" and cgpa is not None and cgpa < 2.5:
        score -= 0.3 * max(0, p["difficulty"] - 60) + 0.2 * max(0, p["workload"] - 60)
    return {"score": round(max(0, min(100, score))), "quality": round(quality), "fit": None if fit is None else round(fit),
            "adjusted_profile": {k: round(v) for k, v in p.items()}}


def _reasons(offering: dict, taste: dict, adj: dict) -> list[tuple[str, str]]:
    """Why an instructor fits, as (Arabic, English) pairs so the UI can show either language."""
    out = []
    dims = (("pace", "أسرع", "أبطأ", "faster", "slower"), ("workload", "أتقل", "أخف", "heavier", "lighter"),
            ("practical", "أكتر عملي", "أكتر نظري", "more hands-on", "more theoretical"))
    en_name = {"pace": "Teaching pace", "workload": "Workload", "practical": "Practical side"}
    for k, ar_hi, ar_lo, en_hi, en_lo in dims:
        if k in taste:
            diff = adj[k] - taste[k]
            if abs(diff) <= 15:
                out.append((f"{DIM_AR[k]} قريب من تفضيلك", f"{en_name[k]} is close to your preference"))
            elif k != "workload" or diff > 0:
                out.append((f"{DIM_AR[k]}: {ar_hi if diff > 0 else ar_lo} من تفضيلك",
                            f"{en_name[k]}: {en_hi if diff > 0 else en_lo} than you prefer"))
    if adj["clarity"] >= 80:
        out.append(("شرحه واضح حسب تقييم الطلبة", "Clear explanations according to students"))
    if adj["satisfaction"] >= 80:
        out.append(("رضا الطلبة عنه عالي", "High student satisfaction"))
    if offering["responses"] < 20:
        n = offering["responses"]
        out.append((f"عدد التقييمات قليل ({n}) فالنتيجة أقل ثقة", f"Only {n} evaluations, so this score is less certain"))
    return out


def recommend_instructor(student_id: str, course_code: str, pace: float | None = None,
                         workload: float | None = None, practical: float | None = None,
                         term: str | None = None) -> dict:
    """Rank the instructors of a course for one student and explain why."""
    s = d.get_student(student_id)
    if not s:
        return d.not_found("الطالب", student_id)
    c = d.find_course(course_code)
    if not c:
        return d.not_found("المادة", course_code)
    offs = [o for o in _offerings() if o["course_code"] == c["code"]
            and (term not in ("fall", "spring") or o["offered_term"] in (term, "both"))]
    if not offs:
        return {"found": True, "course": d.course_label(c["code"]), "ranking": [],
                "explanation": "مفيش دكاترة مسجلين للمادة دي."}
    prefs = student_preferences(student_id, pace, workload, practical)
    basis, taste, n_hist = prefs["basis"], prefs["effective"], prefs["graded_courses_with_instructor"]
    cgpa = s["academic_status"]["cumulative_gpa"]
    ranking = []
    for o in offs:
        sc = _score(o, taste, basis, n_hist, cgpa)
        pairs = _reasons(o, taste, sc["adjusted_profile"])
        ranking.append({**_view(o), **sc, "reasons": [a for a, _ in pairs], "reasons_en": [e for _, e in pairs]})
    ranking.sort(key=lambda r: r["score"], reverse=True)
    for i, r in enumerate(ranking, start=1):
        r["rank"] = i
    top = ranking[0]
    return {"found": True, "student_id": s["student_id"], "course": d.course_label(c["code"]),
            "basis": basis, "basis_ar": BASIS_AR[basis], "basis_en": BASIS_EN[basis], "preferences_used": taste,
            "graded_courses_used": n_hist, "cumulative_gpa": cgpa, "ranking": ranking,
            "explanation": f"أنسب دكتور ليك في {c['name_ar']} هو {top['name_ar']} ({BASIS_AR[basis]}).",
            "note": "الأرقام من استبيانات محاكاة لحد ما الاستبيانات الحقيقية تتحمل."}


def compare_instructors(instructor_a: str, instructor_b: str, course_code: str | None = None,
                        student_id: str | None = None, pace: float | None = None,
                        workload: float | None = None, practical: float | None = None) -> dict:
    """Two instructors of the same course side by side; with a student, who fits them better.

    The course can be left out when the two instructors have exactly one course in common.
    """
    if not course_code:
        ia, ib = _find_instructor(instructor_a), _find_instructor(instructor_b)
        if not ia or not ib:
            return d.not_found("الدكتور", instructor_a if not ia else instructor_b)
        mine = lambda x: {o["course_code"] for o in _offerings() if o["instructor_id"] == x["id"]}
        common = sorted(mine(ia) & mine(ib))
        if not common:
            return {"found": False, "error": f"{ia['name_ar']} و{ib['name_ar']} مبيدرّسوش أي مادة مع بعض."}
        if len(common) > 1:
            return {"found": False, "common_courses": [d.course_label(c) for c in common],
                    "error": "بيدرّسوا أكتر من مادة مع بعض، اختار مادة: " + "، ".join(d.course_label(c) for c in common)}
        course_code = common[0]
    c = d.find_course(course_code)
    if not c:
        return d.not_found("المادة", course_code)
    pair = []
    for q in (instructor_a, instructor_b):
        ins = _find_instructor(q)
        o = _offering_for(c["code"], ins["id"]) if ins else None
        if not o:
            return {"found": False, "error": f"'{q}' مش بيدرّس {d.course_label(c['code'])}"}
        pair.append(o)
    a, b = pair
    pa, pb = _shrunk(a), _shrunk(b)
    rows = [{"dimension": k, "label": DIM_AR[k], "a": round(pa[k]), "b": round(pb[k]), "diff": round(pa[k] - pb[k])}
            for k in DIMS]
    out = {"found": True, "course": d.course_label(c["code"]), "a": _view(a), "b": _view(b), "dimensions": rows}
    if student_id and d.get_student(student_id):
        rec = recommend_instructor(student_id, c["code"], pace, workload, practical)
        by_id = {r["instructor_id"]: r for r in rec["ranking"]}
        sa, sb = by_id[a["instructor_id"]], by_id[b["instructor_id"]]
        better = sa if sa["score"] >= sb["score"] else sb
        out.update(basis=rec["basis"], basis_ar=rec["basis_ar"],
                   scores={a["instructor_id"]: sa["score"], b["instructor_id"]: sb["score"]},
                   better_for_student=better["name_ar"], reasons=better["reasons"],
                   explanation=f"الأنسب ليك {better['name_ar']} ({rec['basis_ar']}).")
    else:
        better = a if a["profile"]["satisfaction"] >= b["profile"]["satisfaction"] else b
        out["explanation"] = "المقارنة على التقييمات بس. قولّي تفضيلاتك (سرعة، عبء، عملي) أو اختار طالب عشان أحدد الأنسب ليك."
    return out


def courses_with_instructors() -> dict:
    """Course codes that have instructor survey data, with how many sections each has (for the course picker)."""
    count: dict[str, int] = {}
    for o in _offerings():
        count[o["course_code"]] = count.get(o["course_code"], 0) + 1
    return {"found": True, "courses": [
        {"code": c, "name_ar": d.courses()[c]["name_ar"], "name_en": d.courses()[c].get("name_en"), "sections": n}
        for c, n in sorted(count.items())]}
