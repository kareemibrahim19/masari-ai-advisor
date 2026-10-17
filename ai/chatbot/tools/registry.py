"""The list of tools the chatbot may call: name, when to use it, its arguments, and the Python function.

`call_tool` is what the chat loop runs when the model asks for a tool. The signed-in student's id is
filled in automatically, so the model never has to guess it.
"""

from . import advisor
from . import assistants as tas
from . import instructors as ins
from . import planner
from . import rules

_STUDENT = {"student_id": {"type": "string", "description": "رقم الطالب (بيتملّى تلقائيًا من الجلسة)."}}
_COURSE = {"type": "string", "description": "كود المادة (زي CSE 351) أو اسمها."}
_TERM_TYPE = {"type": "string", "enum": ["main", "summer"], "description": "main = خريف/ربيع، summer = صيفي."}


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
    _t("academic_level", "المستوى الدراسي للطالب حسب سنته: 0 (Freshman) أو 100 (Sophomore) أو 200 و300 (Junior) أو 400 (Senior)، "
       "والمستوى اللي بعده بيبدأ إمتى، وكام ساعة فاضلة للتخرج.",
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
    _t("paper_registration", "التسجيل الورقي: إمتى الطالب بيسجل ورقي بدل السيستم. (1) معدله أقل من 2.00 ومش تحت الإنذار وعايز 15 ساعة "
       "(5 مواد كل مادة 3 ساعات) والسيستم حده 14، (2) التسجيل قفل على السيستم، (3) هيسجل أقل من 12 ساعة لأنه آخر ترم للتخرج، "
       "(4) سماحية المشاريع: مشروع 1 أو 2 بساعات ناقصة لحد 4، ومشروع 3 لحد 6، "
       "(5) مادة الكلية بتفتحهاله في غير ترمها (طلب تخرج، أو ترم مفيهوش مواد ليه): مش على السيستم فبتتسجل ورقي. "
       "نادِها لما الطالب يسأل عن التسجيل الورقي، أو يقول السيستم قفل، أو عايز يزود عن حده ومعدله أقل من 2، أو عايز أقل من 12، أو عايز يسجل مشروع وساعاته ناقصة.",
       {**_STUDENT,
        "reason": {"type": "string", "enum": ["more_hours", "system_closed", "below_minimum", "project_allowance",
                                              "opened_course"],
                   "description": "more_hours = عايز ساعات أكتر، system_closed = التسجيل قفل، below_minimum = أقل من 12، "
                                  "project_allowance = مشروع وساعاته ناقصة، opened_course = مادة مفتوحة له في غير ترمها. "
                                  "سيبه فاضي لو مش واضح."},
        "course_code": {"type": "string", "description": "كود المشروع لـ project_allowance (ARI 381 أو ARI 481 أو ARI 482). اختياري."},
        "requested_hours": {"type": "number", "description": "عدد الساعات اللي الطالب عايزه لو قاله. اختياري."}},
       ["student_id"], rules.paper_registration, True),
    # ---- who teaches, and the teaching assistants (Masari does not rank or recommend doctors)
    _t("who_teaches", "مين الدكاترة والشعب اللي بيدرّسوا مادة معينة (معلومة بس، مساري مش بيرشح دكاترة).",
       {"course_code": _COURSE, "term": {"type": "string", "enum": ["fall", "spring"]}},
       ["course_code"], ins.who_teaches),
    _t("teaching_assistants", "المعيدين: من غير course_code بترجع مواد الطالب المسجلة الترم ده اللي ليها أكتر من معيد "
       "(ودي اللي في تاب التوصيات)، ومع course_code بترجع معيدين المادة دي. لكل معيد: سنه، سنة تعيينه، "
       "وأول مرة يدرّس المادة ولا المرة الكام. اعرض المعلومات بس ومتفضّلش معيد على التاني.",
       {**_STUDENT, "course_code": {"type": "string", "description": "كود المادة أو اسمها. اختياري."}},
       [], tas.teaching_assistants, True),
]

TOOLS += [
    _t("add_course_to_schedule", "الطالب عايز يضيف مادة لجدوله في صفحة التوصيات (تاب المواد). بتتأكد إنه مؤهل ليها وإن الحمل مش هيعدّي الحد، وبعدها بتضيفها في الصفحة.",
       {**_STUDENT, "course_code": _COURSE}, ["student_id", "course_code"], rules.add_course_to_schedule, True),
    _t("remove_course_from_schedule", "الطالب عايز يشيل مادة من جدوله في صفحة التوصيات (تاب المواد).",
       {"course_code": _COURSE}, ["course_code"], rules.remove_course_from_schedule),
    _t("build_schedule", "الطالب عايز جدول بعدد ساعات معين (مثلًا 15 ساعة): بتختار أعلى المواد أولوية ليه في الحد ده وتحطها في الصفحة.",
       {"hours": {"type": "number", "description": "عدد الساعات المطلوب للجدول."}}, ["hours"], rules.build_schedule),
    # ---- graduation plan (the same planner as the website's plan page)
    _t("graduation_plan", "خطة تخرج الطالب: يقدر يتخرج في 4 أو 4.5 أو 5 سنين ولا لأ، وإمتى أقرب تخرج، ولو مش ممكن ليه، "
       "وهل محتاج ترمات صيفي. نادِها في أي سؤال عن ميعاد التخرج أو التخرج بدري أو مدة الدراسة الفاضلة.",
       {**_STUDENT,
        "target_years": {"type": "number", "enum": [4, 4.5, 5], "description": "الهدف بالسنين لو الطالب ذكره. اختياري."},
        "allow_summer": {"type": "boolean", "description": "الطالب يقدر يحضر صيفي؟ اختياري (الافتراضي: اختياره في صفحة الخطة)."}},
       ["student_id"], planner.graduation_plan, True),
]

TOOLS += [
    # ---- academic advisor: cases only a real advisor can settle, and a ready email to send them
    _t("contact_advisor", "الحالة محتاجة مرشد أكاديمي حقيقي ومساري مش هيقدر يحلها: بترجع سبب التحويل والمطلوب إرفاقه وإيميل جاهز "
       "يبعته الطالب لمرشده. نادِها لما: فات ميعاد التسجيل والسيستم قفل (مش مجرد إنه معلّق)، المادة العدد فيها اكتمل، "
       "مشروع التخرج متسجلش، الطالب عايز ساعات أكتر أو أقل من الحد، استثناء من متطلب سابق، حذف أو انسحاب (محتاج موافقة المرشد)، "
       "تعارض مواعيد، مادة محتاجها مش مفتوحة، مادة مش مفتوحة في برنامجه ويسأل لو مفتوحة في قسم تاني يسجلها بالتشابه، "
       "خطة التخرج بالهدف ده مش ممكنة، إنذار أو خطر فصل، غياب أو امتحان بعذر، "
       "تظلم من درجة أو خطأ في السجل، معادلة أو تحويل، إيقاف قيد أو ظروف شخصية، مشكلة في التدريب، "
       "أو سؤال ملوش إجابة في اللائحة ولا الأدوات. أول مرة نادِها من غير confirmed: هترجع try_first وأسئلة، فاسأل الطالب واعرض عليه تساعده الأول. لو رجّعت needs_info أو try_first اسأل الطالب ask_ar ومتكتبش إيميل.",
       {"case": {"type": "string", "enum": list(advisor.CASES), "description": "نوع الحالة. other لو مفيش نوع مناسب."},
        "details": {"type": "string", "description": "تفاصيل مشكلة الطالب بالعربي الفصيح المختصر وبصيغة المتكلم كأن الطالب هو اللي بيكتب (زي: حاولت التسجيل...، مش: الطالب حاول). هتتحط في الإيميل كما هي."},
        "course_code": {"type": "string", "description": "كود المادة لو الحالة عن مادة معينة. اختياري."},
        "language": {"type": "string", "enum": ["ar", "en"], "description": "لغة الإيميل: en لو الطالب بيكتب إنجليزي، غير كده ar."},
        "reason": {"type": "string", "enum": list(advisor.LOAD_REASONS),
                   "description": "لـ load_exception بس: سبب تغيير الساعات زي ما الطالب قاله. متخمّنهوش؛ لو مقالوش سيبه فاضي والأداة هترجع سؤال."},
        "requested_hours": {"type": "number", "description": "لـ load_exception بس: عدد الساعات اللي الطالب عايزه. متخمّنهوش."},
        "confirmed": {"type": "boolean", "description": "true بس بعد ما الطالب ادّى التفاصيل ومساري ملقاش حل بأدواته، أو الطالب طلب الإيميل صراحة."},
        **_STUDENT}, ["case"], advisor.contact_advisor, True),
    _t("my_advisor", "مين المرشد الأكاديمي بتاع الطالب: اسمه وإيميله ومكتبه وساعاته المكتبية.",
       _STUDENT, ["student_id"], advisor.my_advisor, True),
]

_BY_NAME = {t["name"]: t for t in TOOLS}


def tool_names() -> list[str]:
    return list(_BY_NAME)


def call_tool(name: str, args: dict | None = None, student_id: str | None = None,
              session: dict | None = None) -> dict:
    """Run a tool by name. Unknown tools or bad arguments return an error dict instead of raising.

    `session` is what the website already holds for this student (the schedule on the courses tab, the plan
    page's target), so the chat's answers match what the pages show.
    """
    tool = _BY_NAME.get(name)
    if not tool:
        return {"found": False, "error": f"أداة غير معروفة: {name}"}
    args = {k: v for k, v in (args or {}).items() if v is not None}
    session = session or {}
    if name in ("add_course_to_schedule", "remove_course_from_schedule", "build_schedule"):
        args["eligible"] = session.get("eligible_courses") or []
        args["max_load"] = session.get("max_load")
        if name != "build_schedule":
            args["selected"] = session.get("selected_courses") or []
    if name == "graduation_plan":
        # Default to what the student picked on the plan page, so the chat and the page agree.
        if session.get("plan_target") is not None:
            args.setdefault("target_years", session["plan_target"])
        if session.get("plan_summer") is not None:
            args.setdefault("allow_summer", session["plan_summer"])
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
