"""The list of tools the chatbot may call: name, when to use it, its arguments, and the Python function.

`call_tool` is what the chat loop runs when the model asks for a tool. The signed-in student's id is
filled in automatically, so the model never has to guess it.
"""

from . import instructors as ins
from . import rules

_STUDENT = {"student_id": {"type": "string", "description": "رقم الطالب (بيتملّى تلقائيًا من الجلسة)."}}
_COURSE = {"type": "string", "description": "كود المادة (زي CSE 351) أو اسمها."}
_TERM_TYPE = {"type": "string", "enum": ["main", "summer"], "description": "main = خريف/ربيع، summer = صيفي."}
_PREFS = {
    "pace": {"type": "number", "description": "سرعة الشرح اللي الطالب بيفضلها من 0 (بطيء) لـ 100 (سريع). اختياري."},
    "workload": {"type": "number", "description": "العبء اللي بيفضله من 0 (خفيف) لـ 100 (تقيل). اختياري."},
    "practical": {"type": "number", "description": "الجانب العملي اللي بيفضله من 0 (نظري) لـ 100 (عملي). اختياري."},
}


def _t(name, description, properties, required, fn, needs_student=False):
    return {"name": name, "description": description, "fn": fn, "needs_student": needs_student,
            "parameters": {"type": "object", "properties": properties, "required": required}}


TOOLS = [
    # ---- rule tools
    _t("credit_limit", "أقصى وأدنى عدد ساعات يقدر الطالب يسجلها الترم ده حسب معدله (أو الإنذار)، وكام فاضل له.",
       {**_STUDENT, "term_type": _TERM_TYPE}, ["student_id"], rules.credit_limit, True),
    _t("academic_standing", "هل الطالب تحت الإنذار الأكاديمي، وكام فصل فاضل قبل الفصل من الجامعة.",
       _STUDENT, ["student_id"], rules.academic_standing, True),
    _t("gpa_calculator", "المعدل التراكمي للطالب ومعدل كل ترم وطريقة الحساب.",
       _STUDENT, ["student_id"], rules.gpa_calculator, True),
    _t("retake_info", "إعادة مادة رسب فيها (أقصى تقدير B+) أو تحسين مادة نجح فيها (5 مواد)، وكام تحسين استخدم.",
       {**_STUDENT, "course_code": _COURSE}, ["student_id", "course_code"], rules.retake_info, True),
    _t("course_info", "بيانات مادة: الكود والساعات والنوع والمتطلبات السابقة وتوزيع الدرجات، وحالة الطالب فيها.",
       {"query": _COURSE, **_STUDENT}, ["query"], rules.course_info, True),
    _t("find_courses", "بحث عن مواد باسمها (عربي أو إنجليزي) لما الطالب مايقولش الكود، ويرجّع أقرب المواد.",
       {"query": {"type": "string", "description": "اسم المادة أو جزء منه."}}, ["query"], rules.find_courses),
    _t("improvement_candidates", "المواد الأنسب للتحسين لرفع المعدل: كل مادة ومعدله لو جاب فيها A، وكام تحسين فاضل.",
       _STUDENT, ["student_id"], rules.improvement_candidates, True),
    _t("course_unlocks", "المواد اللي المادة دي بتفتحها (بتكون متطلب سابق ليها) مباشرة وبعدها.",
       {"course_code": _COURSE}, ["course_code"], rules.course_unlocks),
    _t("academic_level", "المستوى الدراسي للطالب (Freshman..Senior) من الساعات اللي نجح فيها وكام فاضل للمستوى اللي بعده.",
       _STUDENT, ["student_id"], rules.academic_level, True),
    _t("elective_status", "المواد الاختيارية: اللي خلّصها وسجلها وكام لسه محتاج والمتاح له.",
       _STUDENT, ["student_id"], rules.elective_status, True),
    _t("attendance_check", "نسبة الغياب وهل هي في الأمان أو إنذار أول (10%) أو تاني (20%) أو حرمان (25%).",
       {"absent_hours": {"type": "number", "description": "عدد ساعات الغياب."},
        "total_hours": {"type": "number", "description": "إجمالي ساعات المادة (محاضرات ومعامل)."},
        "absence_pct": {"type": "number", "description": "نسبة الغياب مباشرة لو معروفة."}}, [], rules.attendance_check),
    _t("drop_withdraw_info", "الحذف والانسحاب: هل لسه ينفع حسب الأسبوع الحالي، وإيه اللي يحصل في السجل.",
       {"current_week": {"type": "integer", "description": "رقم الأسبوع الدراسي الحالي."}, "term_type": _TERM_TYPE,
        **_STUDENT, "course_code": _COURSE}, ["current_week"], rules.drop_withdraw_info, True),
    _t("registration_eligibility", "هل الطالب يقدر يسجل المادة دي: المتطلبات السابقة، المستوى، الساعات، الترم، حد الساعات.",
       {**_STUDENT, "course_code": _COURSE,
        "term_type": {"type": "string", "enum": ["current", "fall", "spring", "summer"],
                      "description": "current = الترم الحالي (الافتراضي)."}},
       ["student_id", "course_code"], rules.registration_eligibility, True),
    # ---- instructor tools
    _t("who_teaches", "مين الدكاترة والشعب اللي بيدرّسوا مادة معينة.",
       {"course_code": _COURSE, "term": {"type": "string", "enum": ["fall", "spring"]}},
       ["course_code"], ins.who_teaches),
    _t("instructor_profile", "بروفايل دكتور من استبيانات الطلبة: سرعة الشرح، العبء، العملي، الوضوح، الرضا، وعدد التقييمات.",
       {"instructor": {"type": "string", "description": "اسم الدكتور أو رقمه (زي i4)."}, "course_code": _COURSE},
       ["instructor"], ins.instructor_profile),
    _t("student_preferences", "تفضيلات الطالب في الدكاترة: اللي قالها، واللي بتقوله درجاته مع دكاترة قبل كده.",
       {**_STUDENT, **_PREFS}, ["student_id"], ins.student_preferences, True),
    _t("compare_instructors", "مقارنة دكتورين لنفس المادة جنب بعض، ومين أنسب للطالب.",
       {"instructor_a": {"type": "string"}, "instructor_b": {"type": "string"},
        "course_code": {"type": "string", "description": "كود المادة أو اسمها. اختياري لو الدكتورين ليهم مادة مشتركة واحدة."},
        **_STUDENT, **_PREFS}, ["instructor_a", "instructor_b"], ins.compare_instructors, True),
    _t("recommend_instructor", "ترتيب دكاترة مادة حسب مناسبتهم للطالب مع السبب (تقييمات الطلبة، تفضيلاته، أداؤه السابق).",
       {**_STUDENT, "course_code": _COURSE, **_PREFS, "term": {"type": "string", "enum": ["fall", "spring"]}},
       ["student_id", "course_code"], ins.recommend_instructor, True),
]

_BY_NAME = {t["name"]: t for t in TOOLS}


def tool_names() -> list[str]:
    return list(_BY_NAME)


def call_tool(name: str, args: dict | None = None, student_id: str | None = None) -> dict:
    """Run a tool by name. Unknown tools or bad arguments return an error dict instead of raising."""
    tool = _BY_NAME.get(name)
    if not tool:
        return {"found": False, "error": f"أداة غير معروفة: {name}"}
    args = {k: v for k, v in (args or {}).items() if v is not None}
    if tool["needs_student"] and student_id and "student_id" in tool["parameters"]["properties"]:
        args["student_id"] = student_id  # the session's student always wins over what the model typed
    try:
        return tool["fn"](**args)
    except TypeError as e:
        return {"found": False, "error": f"مدخلات غلط لأداة {name}: {e}"}


def gemini_tool(with_student: bool = True):
    """The tools as one google-genai Tool (imported lazily so the tools work without the SDK).

    Without a signed-in student, tools that need one are left out so the model cannot call them.
    """
    from google.genai import types
    chosen = [t for t in TOOLS if with_student or "student_id" not in t["parameters"]["required"]]
    return types.Tool(function_declarations=[
        types.FunctionDeclaration(name=t["name"], description=t["description"], parameters_json_schema=t["parameters"])
        for t in chosen])
