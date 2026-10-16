"""Escalation to a real academic advisor: the cases the chatbot cannot settle, and a ready email for each.

Some problems have no answer in the regulations or the tools: the registration system closed before the
student registered, a course section is full, the graduation project was not registered, or the rule itself
says "with the advisor's approval". In all of these Masari tells the student to contact their academic
advisor and writes the email for them. The case list and the email are fixed here (code, not the LLM), so
every student gets the same correct wording; the model only picks the case and passes the details.
"""

import re

from . import _data as d
from . import rules

ADVISOR_PLACEHOLDER = "[إيميل المرشد الأكاديمي]"

# key -> title, why a human is needed, what to attach, the email subject and the request paragraph.
CASES = {
    "registration_missed": {
        "title_ar": "فات ميعاد التسجيل أو نسي يسجل",
        "title_en": "Missed course registration",
        "why_ar": "التسجيل بعد قفل السيستم محتاج فتح استثنائي من إدارة البرنامج، والمرشد هو اللي يرفع الطلب.",
        "attach_ar": ["المواد اللي عايز تسجلها بالأكواد", "سبب التأخير (لو فيه عذر رسمي ارفقه)"],
        "subject_ar": "طلب تسجيل متأخر للمقررات",
        "subject_en": "Request for late course registration",
        "request_ar": "لم أتمكن من تسجيل مقرراتي في الموعد المحدد، وقد أُغلق نظام التسجيل. أرجو التكرم بالموافقة على فتح التسجيل لي استثنائيًا أو توجيهي للإجراء المطلوب.",
        "request_en": "I was not able to register my courses before the registration system closed. I kindly ask for an exceptional late registration or guidance on the required procedure.",
    },
    "course_full": {
        "title_ar": "المادة اكتملت (العدد قفل)",
        "title_en": "Course section is full",
        "why_ar": "زيادة العدد أو فتح شعبة جديدة قرار إداري؛ المرشد بيرفع عدد الطلبة المحتاجين للمادة.",
        "attach_ar": ["كود المادة والشعبة", "هل المادة متطلب سابق لمواد بعدها أو مطلوبة للتخرج"],
        "subject_ar": "طلب إضافة إلى مقرر مكتمل العدد",
        "subject_en": "Request to join a full course section",
        "request_ar": "حاولت التسجيل في المقرر المذكور لكن العدد اكتمل. أرجو التكرم بإضافتي إليه أو فتح شعبة إضافية، لأن تأجيله سيؤثر على خطتي الدراسية.",
        "request_en": "I tried to register for the course below but the section is full. I kindly ask to be added or for an extra section, as postponing it would affect my study plan.",
    },
    "project_registration": {
        "title_ar": "مشكلة في تسجيل مشروع التخرج",
        "title_en": "Graduation project registration",
        "why_ar": "تسجيل المشروع مرتبط بالمشرف واللجنة، وأي تأخير أو خطأ فيه لازم المرشد يحله بنفسه.",
        "attach_ar": ["اسم المشرف المقترح (لو موجود)", "أسماء أعضاء الفريق", "عدد ساعاتك المجتازة"],
        "subject_ar": "مشكلة في تسجيل مشروع التخرج",
        "subject_en": "Issue with graduation project registration",
        "request_ar": "لم يتم تسجيل مشروع التخرج الخاص بي على النظام. أرجو التكرم بمساعدتي في تسجيله أو توضيح الإجراء المطلوب قبل فوات الموعد.",
        "request_en": "My graduation project was not registered on the system. I kindly ask for your help registering it or clarifying the procedure before the deadline.",
    },
    "load_exception": {
        "title_ar": "طلب ساعات أكتر أو أقل من الحد",
        "title_en": "Credit load exception",
        "why_ar": "الخروج عن حد الساعات (مادة 13) استثناء محتاج موافقة المرشد والمجلس الأكاديمي.",
        "attach_ar": ["خطة تخرجك من صفحة \"خطة التخرج\" (لو السبب التخرج أو اللحاق بالخطة)", "أي مستند يثبت الظرف (لو عايز ساعات أقل)"],
        "subject_ar": "طلب استثناء في العبء الدراسي",
        "subject_en": "Request for a credit load exception",
        "request_ar": "أرغب في التقدم بطلب استثناء في عدد الساعات المسجلة هذا الفصل للسبب الموضح أدناه. أرجو التكرم بدراسة الطلب ورفعه للجهة المختصة.",
        "request_en": "I would like to request an exception to the credit load limit this term for the reason below. I kindly ask you to review it and forward it to the relevant committee.",
        "needs": ["reason", "requested_hours"],
    },
    "prerequisite_exception": {
        "title_ar": "طلب استثناء من متطلب سابق أو تسجيل متزامن",
        "title_en": "Prerequisite exception",
        "why_ar": "التسجيل المتزامن مع المتطلب (مادة 19) أو تجاوزه محتاج موافقة المرشد.",
        "attach_ar": ["المادة والمتطلب الناقص", "هل الطالب في سنة التخرج"],
        "subject_ar": "طلب تسجيل متزامن مع المتطلب السابق",
        "subject_en": "Request for concurrent prerequisite registration",
        "request_ar": "أرغب في تسجيل المقرر المذكور مع متطلبه السابق في نفس الفصل. أرجو التكرم بالموافقة إن أمكن وفقًا للائحة.",
        "request_en": "I would like to register the course below together with its prerequisite in the same term. I kindly ask for your approval if the regulations allow it.",
    },
    "drop_withdraw": {
        "title_ar": "حذف أو انسحاب من مادة",
        "title_en": "Drop or withdraw approval",
        "why_ar": "الحذف والانسحاب (مادة 15) مش بيتموا غير بموافقة المرشد الأكاديمي.",
        "attach_ar": ["كود المادة", "رقم الأسبوع الدراسي الحالي", "السبب"],
        "subject_ar": "طلب حذف/انسحاب من مقرر",
        "subject_en": "Request to drop / withdraw from a course",
        "request_ar": "أرغب في الحذف/الانسحاب من المقرر المذكور هذا الفصل. أرجو التكرم بالموافقة على الطلب.",
        "request_en": "I would like to drop / withdraw from the course below this term. I kindly ask for your approval.",
    },
    "schedule_conflict": {
        "title_ar": "تعارض في مواعيد المواد",
        "title_en": "Timetable conflict",
        "why_ar": "حل التعارض بتغيير شعبة أو استثناء محتاج تدخل المرشد أو إدارة الجداول.",
        "attach_ar": ["المادتين المتعارضتين والشعب", "المواعيد"],
        "subject_ar": "تعارض في مواعيد مقررات مطلوبة",
        "subject_en": "Timetable conflict between required courses",
        "request_ar": "يوجد تعارض في المواعيد بين المقررين المذكورين وكلاهما مطلوب في خطتي. أرجو التكرم بمساعدتي في تغيير الشعبة أو إيجاد حل مناسب.",
        "request_en": "There is a timetable conflict between the two courses below, and both are required in my plan. I kindly ask for help changing a section or finding a solution.",
    },
    "course_not_offered": {
        "title_ar": "مادة محتاجها مش مفتوحة (ترم أو صيفي)",
        "title_en": "Required course not offered",
        "why_ar": "فتح مادة في ترم معين قرار الكلية؛ المرشد يقدر يطلبه لو المادة بتأخر التخرج.",
        "attach_ar": ["كود المادة", "الترم اللي محتاجها فيه", "تأثيرها على ميعاد تخرجك"],
        "subject_ar": "طلب فتح مقرر غير متاح هذا الفصل",
        "subject_en": "Request to offer a course this term",
        "request_ar": "المقرر المذكور غير مطروح هذا الفصل، وعدم دراسته الآن سيؤخر تخرجي. أرجو التكرم بالنظر في إمكانية فتحه أو اقتراح بديل.",
        "request_en": "The course below is not offered this term, and not taking it now will delay my graduation. I kindly ask whether it can be offered or an alternative suggested.",
    },
    "other_department_course": {
        "title_ar": "مادة مش مفتوحة في برنامجي: هل مفتوحة في قسم تاني أسجلها بالتشابه؟",
        "title_en": "Equivalent course in another department",
        "why_ar": "مساري معندوش جداول طرح الأقسام التانية، فاسأل بنفسك في الأقسام اللي بتدرّس نفس المادة لو مفتوحة الترم ده. والتسجيل بالتشابه (مادة مكافئة من قسم تاني) محتاج موافقة المرشد ورئيس القسم.",
        "attach_ar": ["كود المادة واسمها", "الترم اللي محتاجها فيه", "إنها بتأثر على ميعاد تخرجك (من صفحة خطة التخرج)"],
        "subject_ar": "استفسار عن طرح مقرر في قسم آخر للتسجيل بالتشابه",
        "subject_en": "Equivalent course offered by another department",
        "request_ar": "المقرر المذكور غير مطروح في برنامجي هذا الفصل، وأحتاجه للالتزام بخطة تخرجي. أرجو التكرم بإفادتي إن كان هذا المقرر أو مقرر مكافئ له مطروحًا في قسم آخر هذا الفصل، وإمكانية تسجيله بنظام التشابه.",
        "request_en": "The course below is not offered in my program this term, and I need it to stay on my graduation plan. I kindly ask whether it, or an equivalent course, is offered by another department this term, and whether I can register it as an equivalent.",
        "needs": ["course_code"],
    },
    "graduation_plan": {
        "title_ar": "خطة التخرج محتاجة مراجعة (هدف مش ممكن أو مواد ناقصة)",
        "title_en": "Graduation plan review",
        "why_ar": "لما الأدوات تقول إن الهدف مش ممكن بالقواعد العادية، أي استثناء أو خطة بديلة لازم يتعمل مع المرشد.",
        "attach_ar": ["ميعاد التخرج اللي عايزه", "المواد الفاضلة لك", "نتيجة صفحة خطة التخرج"],
        "subject_ar": "مراجعة خطة التخرج",
        "subject_en": "Graduation plan review",
        "request_ar": "أرغب في مراجعة خطة تخرجي معكم، حيث تبين أن الهدف الذي أسعى إليه غير ممكن بالخطة الحالية. أرجو التكرم بتحديد موعد لمناقشة الحلول المتاحة.",
        "request_en": "I would like to review my graduation plan with you, as my target does not seem reachable with the current plan. I kindly ask for a meeting to discuss the options.",
    },
    "academic_warning": {
        "title_ar": "إنذار أكاديمي أو خطر فصل",
        "title_en": "Academic warning / dismissal risk",
        "why_ar": "الطالب تحت الإنذار (مادة 25) محتاج خطة متابعة مع المرشد، خصوصًا لو قرب من الفصل.",
        "attach_ar": ["معدلك التراكمي الحالي", "عدد ترمات الإنذار", "المواد اللي بتواجه فيها صعوبة"],
        "subject_ar": "طلب متابعة أكاديمية بسبب الإنذار",
        "subject_en": "Academic warning follow-up",
        "request_ar": "أنا حاليًا تحت الإنذار الأكاديمي، وأرغب في وضع خطة لرفع معدلي وتجنب الفصل. أرجو التكرم بتحديد موعد للمتابعة.",
        "request_en": "I am currently on academic warning and would like to set a plan to raise my GPA and avoid dismissal. I kindly ask for a follow-up meeting.",
    },
    "attendance_excuse": {
        "title_ar": "غياب بعذر أو حرمان من دخول الامتحان",
        "title_en": "Excused absence / exam deprivation",
        "why_ar": "قبول العذر (مادة 12) أو رفع الحرمان قرار إداري بيمر على المرشد.",
        "attach_ar": ["العذر الرسمي (شهادة مرضية مثلًا)", "المادة وتواريخ الغياب"],
        "subject_ar": "تقديم عذر عن الغياب",
        "subject_en": "Excused absence request",
        "request_ar": "تغيبت عن المقرر المذكور لعذر مرفق. أرجو التكرم بقبول العذر واتخاذ اللازم حتى لا أُحرم من دخول الامتحان.",
        "request_en": "I was absent from the course below for the attached reason. I kindly ask that the excuse be accepted so I am not barred from the exam.",
    },
    "exam_excuse": {
        "title_ar": "غياب عن امتحان بعذر (غير مكتمل)",
        "title_en": "Missed exam with an excuse",
        "why_ar": "تأجيل الامتحان أو تقدير غير مكتمل محتاج موافقة رسمية.",
        "attach_ar": ["العذر الرسمي", "المادة وميعاد الامتحان"],
        "subject_ar": "غياب عن امتحان بعذر",
        "subject_en": "Missed exam with a valid excuse",
        "request_ar": "تغيبت عن امتحان المقرر المذكور لعذر رسمي مرفق. أرجو التكرم بإفادتي بالإجراء المطلوب لأداء الامتحان لاحقًا.",
        "request_en": "I missed the exam of the course below for the attached official reason. I kindly ask about the procedure to sit the exam later.",
    },
    "grade_issue": {
        "title_ar": "تظلم من درجة أو درجة مش ظاهرة",
        "title_en": "Grade appeal / missing grade",
        "why_ar": "مراجعة الدرجات وتصحيح السجل بيتم عن طريق الكلية، مش من مساري.",
        "attach_ar": ["كود المادة", "الدرجة الظاهرة والمتوقعة", "سبب التظلم"],
        "subject_ar": "تظلم/استفسار عن درجة مقرر",
        "subject_en": "Grade appeal / inquiry",
        "request_ar": "لدي استفسار بخصوص درجتي في المقرر المذكور. أرجو التكرم بمراجعتها أو توجيهي لإجراءات التظلم.",
        "request_en": "I have a concern about my grade in the course below. I kindly ask for it to be reviewed or for guidance on the appeal procedure.",
    },
    "record_error": {
        "title_ar": "خطأ في بيانات السجل (ساعات أو معدل أو مادة)",
        "title_en": "Error in the academic record",
        "why_ar": "مساري بيقرا البيانات من السجل؛ لو السجل نفسه غلط لازم يتصلح من الكلية.",
        "attach_ar": ["البيان الغلط وصحته", "أي إثبات (نتيجة، إيصال...)"],
        "subject_ar": "تصحيح خطأ في السجل الأكاديمي",
        "subject_en": "Correction of an error in my academic record",
        "request_ar": "لاحظت خطأ في سجلي الأكاديمي كما هو موضح أدناه. أرجو التكرم بمراجعته وتصحيحه.",
        "request_en": "I noticed an error in my academic record as described below. I kindly ask for it to be reviewed and corrected.",
    },
    "transfer_equivalency": {
        "title_ar": "معادلة مواد أو تحويل",
        "title_en": "Course equivalency / transfer",
        "why_ar": "المعادلة والتحويل بتعتمدها لجنة، والمرشد بيبدأ الإجراء.",
        "attach_ar": ["المواد اللي درستها قبل كده وتوصيفها", "الكلية أو البرنامج اللي جاي منه"],
        "subject_ar": "طلب معادلة مقررات",
        "subject_en": "Course equivalency request",
        "request_ar": "أرغب في التقدم بطلب معادلة للمقررات الموضحة أدناه. أرجو التكرم بإفادتي بالإجراءات والمستندات المطلوبة.",
        "request_en": "I would like to request an equivalency for the courses below. I kindly ask about the procedure and required documents.",
    },
    "leave_of_absence": {
        "title_ar": "إيقاف قيد أو ظروف شخصية",
        "title_en": "Leave of absence / personal circumstances",
        "why_ar": "إيقاف القيد والظروف الخاصة بتحتاج تقدير إنساني وقرار رسمي، مش قاعدة ثابتة.",
        "attach_ar": ["توضيح الظرف باختصار", "أي مستند داعم"],
        "subject_ar": "طلب بخصوص ظروف شخصية تؤثر على دراستي",
        "subject_en": "Personal circumstances affecting my studies",
        "request_ar": "أمر بظروف شخصية تؤثر على انتظامي في الدراسة هذا الفصل. أرجو التكرم بتحديد موعد لمناقشة الخيارات المتاحة مثل إيقاف القيد.",
        "request_en": "I am going through personal circumstances affecting my studies this term. I kindly ask for a meeting to discuss options such as a leave of absence.",
    },
    "training": {
        "title_ar": "مشكلة في التدريب الميداني",
        "title_en": "Field training issue",
        "why_ar": "تسجيل واعتماد التدريب (مادة 17) بيتابعه المرشد ومنسق التدريب.",
        "attach_ar": ["كود التدريب", "جهة التدريب وفترته", "المشكلة"],
        "subject_ar": "استفسار بخصوص التدريب الميداني",
        "subject_en": "Field training inquiry",
        "request_ar": "لدي مشكلة تخص التدريب الميداني كما هو موضح أدناه. أرجو التكرم بمساعدتي أو توجيهي لمنسق التدريب.",
        "request_en": "I have an issue regarding my field training as described below. I kindly ask for your help or a referral to the training coordinator.",
    },
    "other": {
        "title_ar": "سؤال ملوش إجابة في اللائحة أو الأدوات",
        "title_en": "Question not covered by the regulations",
        "why_ar": "المعلومة مش موجودة في اللائحة ولا في بيانات مساري، فالمرشد هو المرجع.",
        "attach_ar": ["سؤالك بالتفصيل"],
        "subject_ar": "استفسار أكاديمي",
        "subject_en": "Academic inquiry",
        "request_ar": "لدي استفسار أكاديمي لم أجد إجابته في اللائحة. أرجو التكرم بإفادتي.",
        "request_en": "I have an academic question I could not find an answer to in the regulations. I kindly ask for your guidance.",
    },
}


# Why a student asks for more / fewer hours. The reason changes the email and what the advisor decides, so
# Masari asks for it first instead of writing a generic request: (Egyptian Arabic option, English, formal Arabic).
LOAD_REASONS = {
    "graduation": ("عشان أتخرج الترم ده أو في ميعادي", "to graduate this term or on time",
                   "أحتاج هذه الساعات للتخرج في موعدي وفق خطة تخرجي."),
    "behind_plan": ("متأخر عن الخطة (رسوب أو مواد متأجلة) وعايز ألحق", "behind the study plan and catching up",
                    "تأخرت عن خطتي الدراسية بسبب مقررات مؤجلة أو لم أجتزها، وأرغب في اللحاق بها."),
    "retake_improve": ("عايز أعيد أو أحسّن مواد مع مواد الترم", "retaking / improving courses alongside this term's courses",
                       "أرغب في إعادة/تحسين مقررات إلى جانب مقررات الفصل الحالي."),
    "reduce_load": ("عايز أقل من 12 ساعة (ظروف صحية أو شغل أو شخصية)", "fewer hours for health, work or personal reasons",
                    "أمر بظروف تجعلني غير قادر على تحمل العبء الدراسي المعتاد، وأرغب في تسجيل عدد ساعات أقل من الحد الأدنى."),
    "other": ("سبب تاني", "another reason", "لأسباب موضحة في التفاصيل."),
}

# What Masari asks before suggesting the advisor: with these details it may still find a solution with its
# own tools (another section, a summer course, a different plan...), and if not, they go into the email.
CASE_QUESTIONS = {
    "registration_missed": ["التسجيل قفل خالص ولا لسه فيه فترة إضافة وحذف؟", "إيه المواد اللي كنت عايز تسجلها؟"],
    "course_full": ["إيه المادة؟ وفيه شعب تانية ليها مفتوحة؟", "المادة دي متطلب لمواد بعدها أو محتاجها عشان تتخرج في ميعادك؟"],
    "project_registration": ["إيه اللي حصل بالظبط: نسيت تسجل، ولا متسجل غلط، ولا مش لاقي مشرف؟", "معاك فريق ومشرف متفقين؟"],
    "load_exception": [],
    "prerequisite_exception": ["إيه المادة وإيه المتطلب الناقص؟", "إنت في سنة التخرج؟"],
    "drop_withdraw": ["إيه المادة؟", "إحنا في أسبوع كام من الترم؟", "ليه عايز تحذفها أو تنسحب؟"],
    "schedule_conflict": ["إيه المادتين اللي متعارضين؟", "فيه شعبة تانية لأي واحدة فيهم؟"],
    "course_not_offered": ["إيه المادة؟", "محتاجها في أنهي ترم؟"],
    "other_department_course": ["محتاجها الترم ده عشان خطة تخرجك ولا ممكن تستنى الترم الجاي؟"],
    "graduation_plan": ["عايز تتخرج إمتى؟", "تقدر تحضر صيفي؟"],
    "academic_warning": ["إيه المواد اللي بتواجه فيها صعوبة؟", "عايزني أشوفلك مواد تحسّن فيها معدلك؟"],
    "attendance_excuse": ["إيه المادة وكام محاضرة غبت؟", "معاك عذر رسمي (شهادة مرضية مثلًا)؟"],
    "exam_excuse": ["إيه المادة وإمتى كان الامتحان؟", "معاك عذر رسمي؟"],
    "grade_issue": ["إيه المادة؟", "الدرجة الظاهرة كام وكنت متوقع كام وليه؟"],
    "record_error": ["إيه البيان الغلط بالظبط (ساعات، معدل، مادة)؟", "المفروض يكون كام؟"],
    "transfer_equivalency": ["جاي من أنهي كلية أو برنامج؟", "إيه المواد اللي عايز تعادلها؟"],
    "leave_of_absence": ["لو مرتاح تقول، الظرف ده هيأثر على الترم كله ولا جزء منه؟"],
    "training": ["إيه التدريب (الكود) وفين؟", "إيه المشكلة بالظبط: التسجيل ولا الاعتماد ولا مش ظاهر في السجل؟"],
    "other": ["احكيلي المشكلة بالتفصيل."],
}

QUESTIONS = {
    "reason": "ليه عايز تغيّر عدد الساعات؟ " + " / ".join(f"({i}) {v[0]}" for i, v in enumerate(LOAD_REASONS.values(), 1)),
    "requested_hours": "عايز تسجل كام ساعة بالظبط؟",
    "course_code": "إيه المادة (الكود أو الاسم)؟",
}


def _student_lines(s: dict | None, lang: str) -> tuple[str, list[str]]:
    """(name, identity lines) for the email; placeholders when no student is selected."""
    if not s:
        name = "[اسمك]" if lang == "ar" else "[Your name]"
        return name, ([f"الاسم: {name}", "الرقم الجامعي: [رقمك]"] if lang == "ar"
                      else [f"Name: {name}", "Student ID: [your ID]"])
    p, st = s["personal"], s["academic_status"]
    if lang == "ar":
        return p["name_ar"], [f"الاسم: {p['name_ar']}", f"الرقم الجامعي: {s['student_id']}",
                              "البرنامج: هندسة الذكاء الاصطناعي (AIE)",
                              f"الساعات المجتازة: {st['earned_hours']} من {st['required_hours']}",
                              f"المعدل التراكمي: {st['cumulative_gpa'] if st['cumulative_gpa'] is not None else 'لا يوجد بعد'}"]
    return p["name_en"], [f"Name: {p['name_en']}", f"Student ID: {s['student_id']}",
                          "Program: Artificial Intelligence Engineering (AIE)",
                          f"Earned hours: {st['earned_hours']} of {st['required_hours']}",
                          f"Cumulative GPA: {st['cumulative_gpa'] if st['cumulative_gpa'] is not None else 'N/A'}"]


def contact_advisor(case: str, details: str = "", course_code: str | None = None,
                    student_id: str | None = None, language: str = "ar", reason: str | None = None,
                    requested_hours: float | None = None, confirmed: bool = False) -> dict:
    """The escalation for one case: why the advisor is needed, what to attach, and a ready email draft.

    Two steps before the email:
    1. Some cases need facts first (why they want more hours, which course): until given, `needs_info`.
    2. The first call (confirmed=False) never writes the email: it returns `try_first` with questions about the
       problem, so Masari asks for details and tries to solve it with its own tools. Only when the student
       still needs the advisor (or asks for the email) the chat calls again with confirmed=True.
    """
    case = case if case in CASES else "other"
    c = CASES[case]
    given = {"reason": reason if reason in LOAD_REASONS else None, "requested_hours": requested_hours,
             "course_code": course_code}
    missing = [k for k in c.get("needs", []) if not given[k]]
    if missing:
        return {"found": True, "case": case, "title_ar": c["title_ar"], "needs_info": True, "missing": missing,
                "ask_ar": [QUESTIONS[k] for k in missing],
                "explanation": "متكتبش الإيميل لسه: اسأل الطالب الأسئلة اللي في ask_ar، وبعد ما يجاوب نادِ الأداة تاني بالإجابات."}
    if not confirmed:
        return {"found": True, "case": case, "title_ar": c["title_ar"], "try_first": True,
                "ask_ar": CASE_QUESTIONS.get(case) or CASE_QUESTIONS["other"], "why_ar": c["why_ar"],
                "explanation": ("متكتبش الإيميل لسه. قول للطالب إنك ممكن تساعده أكتر وتوصلوا لحل قبل ما يبعت للمرشد، "
                                "واطلب منه التفاصيل اللي في ask_ar. لو بعد التفاصيل لقيت حل بأدواتك قوله، ولو لأ "
                                "(أو هو طلب الإيميل) نادِ الأداة تاني بـ confirmed=true والتفاصيل.")}

    lang = "en" if language == "en" else "ar"
    s = d.get_student(student_id) if student_id else None
    name, who = _student_lines(s, lang)
    if case == "load_exception":
        why_en, sentence = LOAD_REASONS[reason][1:]
        limit = rules.credit_limit(s["student_id"]) if s else {}
        rng = (limit["min_credits"], limit["max_credits"]) if limit.get("found") else None
        if lang == "ar":
            who.append(f"الساعات المطلوبة: {requested_hours:g}" + (f" (المسموح لي حاليًا من {rng[0]} إلى {rng[1]})" if rng else ""))
            who.append(f"السبب: {sentence}")
        else:
            who.append(f"Requested hours: {requested_hours:g}" + (f" (my current limit is {rng[0]}-{rng[1]})" if rng else ""))
            who.append(f"Reason: {why_en}")
        if reason == "graduation" and s:
            left = rules.academic_level(s["student_id"]).get("hours_to_graduation")
            if left is not None:
                who.append(f"الساعات المتبقية للتخرج: {left}" if lang == "ar" else f"Hours left to graduate: {left}")
    course = d.find_course(course_code) if course_code else None
    if course:
        who.append(f"المقرر: {course['code']} {course['name_ar']}" if lang == "ar"
                   else f"Course: {course['code']} {course.get('name_en', '')}")
    elif course_code:
        who.append(f"المقرر: {course_code}" if lang == "ar" else f"Course: {course_code}")

    advisor = d.advisor_of(s["student_id"] if s else None) or {}
    to = advisor.get("email") or ADVISOR_PLACEHOLDER
    if lang == "ar":
        greeting = f"{advisor['name_ar']}،" if advisor else "السيد/ة المرشد الأكاديمي المحترم،"
        body = "\n".join([greeting, "تحية طيبة وبعد،", "", c["request_ar"], "",
                          *(["التفاصيل:", details.strip(), ""] if details.strip() else []),
                          "بياناتي:", *[f"- {line}" for line in who], "",
                          "وتفضلوا بقبول فائق الاحترام،", name,
                          (s or {}).get("contact", {}).get("university_email", "")]).strip()
        subject = f"{c['subject_ar']} - {s['student_id']}" if s else c["subject_ar"]
    else:
        greeting = f"Dear {advisor['name_en']}," if advisor else "Dear Academic Advisor,"
        body = "\n".join([greeting, "", c["request_en"], "",
                          *(["Details:", details.strip(), ""] if details.strip() else []),
                          "My information:", *[f"- {line}" for line in who], "",
                          "Best regards,", name,
                          (s or {}).get("contact", {}).get("university_email", "")]).strip()
        subject = f"{c['subject_en']} - {s['student_id']}" if s else c["subject_en"]

    email = {"to": to, "subject": subject, "body": body}
    return {"found": True, "case": case,
            "title_ar": c["title_ar"], "why_ar": c["why_ar"], "attach_ar": c["attach_ar"],
            "advisor": _advisor_card(advisor), "advisor_known": bool(advisor), "email": email,
            "explanation": ("الحالة دي محتاجة مرشد أكاديمي حقيقي. قول للطالب يبعت الإيميل ده لمرشده "
                            + (f"{advisor['name_ar']} على {advisor['email']}" if advisor else
                               "(ولو مش عارف إيميله يكتبه مكان الـ placeholder)")
                            + "، أو يروحله في ساعاته المكتبية."),
            # The website can show a "send email" button (mailto) next to the answer.
            "action": {"type": "advisor_email", **email}}


def _advisor_card(a: dict) -> dict | None:
    """What the student needs to reach the advisor (without the list of the advisor's students)."""
    return {k: a[k] for k in ("name_ar", "name_en", "title_ar", "email", "office_ar", "office_hours_ar")} if a else None


def my_advisor(student_id: str) -> dict:
    """Who the student's academic advisor is and how to reach them."""
    s = d.get_student(student_id)
    if not s:
        return d.not_found("الطالب", student_id)
    a = d.advisor_of(student_id)
    if not a:
        return {"found": False, "error": "مفيش مرشد أكاديمي مسجل للطالب ده؛ يسأل شئون الطلاب."}
    return {"found": True, "advisor": _advisor_card(a)}


# ---------------------------------------------------------------- spotting advisor cases in the question
# The model decides when to call contact_advisor, but the weaker fallback models sometimes skip it. These
# patterns spot the clear cases in the student's own words, so the chat can remind (or make) the model call it.

def _norm(text: str) -> str:
    text = re.sub(r"[ًٌٍَُِّْـ]", "", (text or "").lower())
    return re.sub(r"[إأآ]", "ا", text).replace("ة", "ه").replace("ى", "ي")


# The student asks for the advisor or for an email to them: the tool must be called.
_EXPLICIT = re.compile(r"(ايميل|اميل|ميل|رساله|email|e-mail|mail).{0,25}(مرشد|advisor|morshed)"
                       r"|(مرشد|advisor|morshed).{0,25}(ايميل|اميل|ميل|email|mail)"
                       r"|(اكلم|اتواصل مع|ابعت ل|اكتب ل|كلم|تواصل مع).{0,6}(ال)?مرشد"
                       r"|(مين|ايه)\s+(هو\s+)?(ال)?مرشد|مرشدي")
# Words of one of the cases: the model is reminded to consider contact_advisor.
_LIKELY = re.compile(r"العدد\s*(قفل|اتقفل|كمل|اكتمل|خلص)|(اكتملت|مكتمل|كامل)\s*العدد|مفيش\s*(اماكن|مكان)"
                     r"|نسيت\s*(ا|اني\s*)?سجل|فات\s*(ميعاد\s*)?التسجيل|التسجيل\s*(قفل|خلص)|السيستم\s*قفل"
                     r"|المشروع\s*(متسجلش|مش\s*متسجل)|مسجلتش\s*المشروع"
                     r"|(ازود|ازيد|زياده|اقلل|اقل)\s*.{0,10}(حد\s*)?(الساعات|ساعات)"
                     r"|قسم\s*تاني|بالتشابه|تشابه|معادل|تحويل\s*من"
                     r"|تعارض|متعارض|تظلم|عذر|ايقاف\s*قيد|ظروف|درجتي\s*غلط|السجل\s*غلط|مش\s*ظاهر")


def advisor_signal(question: str) -> str | None:
    """'explicit' (asks for the advisor / an email), 'likely' (words of an advisor case) or None."""
    q = _norm(question)
    if _EXPLICIT.search(q):
        return "explicit"
    if _LIKELY.search(q):
        return "likely"
    return None


def escalation_cases() -> list[dict]:
    """Every case with its title, for documentation and the frontend."""
    return [{"case": k, "title_ar": v["title_ar"], "title_en": v["title_en"]} for k, v in CASES.items()]
