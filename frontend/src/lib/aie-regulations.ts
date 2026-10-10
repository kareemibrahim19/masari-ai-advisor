/**
 * AIE program regulations, paraphrased from the "Program Regulations & Specs" tab of the
 * AIE Program Guide (unofficial summary). These are the rules the rules engine implements
 * and the RAG sources cite. Verify against the official bylaws.
 */
import type { L } from "@/lib/i18n"

export const loadTable: { range: L; max: number; min?: number; maxGpa?: number }[] = [
  { range: { ar: "المعدل < 2.00", en: "GPA < 2.00" }, max: 14, maxGpa: 2 },
  { range: { ar: "2.00 ≤ المعدل < 3.00", en: "2.00 ≤ GPA < 3.00" }, max: 18, min: 2, maxGpa: 3 },
  { range: { ar: "المعدل ≥ 3.00", en: "GPA ≥ 3.00" }, max: 21, min: 3 },
]

export const gradeScale: { grade: string; points: string; range: string }[] = [
  { grade: "A+", points: "4.00", range: "97 – 100" },
  { grade: "A", points: "4.00", range: "93 – <97" },
  { grade: "A−", points: "3.70", range: "89 – <93" },
  { grade: "B+", points: "3.30", range: "84 – <89" },
  { grade: "B", points: "3.00", range: "80 – <84" },
  { grade: "B−", points: "2.70", range: "76 – <80" },
  { grade: "C+", points: "2.30", range: "73 – <76" },
  { grade: "C", points: "2.00", range: "70 – <73" },
  { grade: "C−", points: "1.70", range: "67 – <70" },
  { grade: "D+", points: "1.30", range: "64 – <67" },
  { grade: "D", points: "1.00", range: "60 – <64" },
  { grade: "F", points: "0.00", range: "< 60" },
]

export const assessment: { title: L; parts: { label: L; pct: number }[] }[] = [
  {
    title: { ar: "مقررات نظري فقط", en: "Theory-only courses" },
    parts: [
      { label: { ar: "منتصف الترم", en: "Midterm" }, pct: 20 },
      { label: { ar: "أعمال السنة", en: "Semester work" }, pct: 30 },
      { label: { ar: "النهائي", en: "Final" }, pct: 50 },
    ],
  },
  {
    title: { ar: "نظري + معمل", en: "Theory + lab" },
    parts: [
      { label: { ar: "منتصف الترم", en: "Midterm" }, pct: 20 },
      { label: { ar: "أعمال السنة", en: "Semester work" }, pct: 20 },
      { label: { ar: "امتحان المعمل", en: "Lab exam" }, pct: 10 },
      { label: { ar: "النهائي", en: "Final" }, pct: 50 },
    ],
  },
  {
    title: { ar: "المشروعات", en: "Projects" },
    parts: [
      { label: { ar: "متابعة دورية", en: "Periodic follow-up" }, pct: 50 },
      { label: { ar: "المناقشة النهائية", en: "Final discussion" }, pct: 50 },
    ],
  },
]

export type RuleSection = { id: string; title: L; items: L[]; note?: L }

export const ruleSections: RuleSection[] = [
  {
    id: "load",
    title: { ar: "العبء الدراسي", en: "Academic load" },
    items: [
      { ar: "الحد الأدنى 12 ساعة في الخريف والربيع، إلا في ترم التخرج أو بموافقة المجلس.", en: "Minimum 12 credits in Fall and Spring, except in the graduation term or with council approval." },
      { ar: "الترم الصيفي: 3 مقررات بحد أقصى، ومشروعات التخرج مش بتتسجل فيه.", en: "Summer term: at most 3 courses, and graduation projects cannot be registered." },
    ],
    note: {
      ar: "تعارض في المصدر: جدول العبء بيقول 14 ساعة لمعدل أقل من 2.00، لكن قسم الإنذار بيقول 12 ساعة للطالب تحت الملاحظة. محتاج تأكيد من اللائحة الرسمية.",
      en: "Conflict in the source: the load table says 14 credits for GPA < 2.00, but the warning section caps students on probation at 12. Needs confirmation from the official bylaws.",
    },
  },
  {
    id: "passing",
    title: { ar: "النجاح والحضور", en: "Passing & attendance" },
    items: [
      { ar: "النجاح: 60% على الأقل في المقرر، و40% على الأقل في الامتحان التحريري النهائي.", en: "To pass: at least 60% overall and at least 40% in the final written exam." },
      { ar: "أقصى غياب 25% من المحاضرات والمعامل. إنذار أول عند 10% وتاني عند 20%.", en: "Maximum absence is 25% of lectures and labs, with warnings at 10% and 20%." },
      { ar: "تجاوز 25% من غير عذر مقبول ← تقدير «محروم» ويتحسب في المعدل.", en: "Over 25% without an accepted excuse → a 'Deprived' grade that counts in the GPA." },
    ],
  },
  {
    id: "drop",
    title: { ar: "الإضافة والحذف والانسحاب والإعادة", en: "Add, drop, withdraw & retake" },
    items: [
      { ar: "الحذف لحد آخر الأسبوع الرابع بموافقة المرشد الأكاديمي.", en: "Drop until the end of week 4, with academic advisor approval." },
      { ar: "الانسحاب (W) لحد آخر الأسبوع العاشر (الثالث في الصيفي)، لو مش متجاوز نسبة الغياب.", en: "Withdraw (W) until the end of week 10 (week 3 in summer), if absence limits are not exceeded." },
      { ar: "إعادة مقرر سقطت فيه (F): أعلى تقدير ممكن B+.", en: "Retaking a failed (F) course: the highest possible grade is B+." },
      { ar: "إعادة اختياري سقطت فيه: بتاخد الأقل من التقديرين كحد أقصى. لو غيّرت الاختياري، بتاخد تقديرك الجديد.", en: "Retaking a failed elective is capped at the lower of the two grades; switching to a different elective keeps the new grade." },
    ],
  },
  {
    id: "warning",
    title: { ar: "الإنذار والفصل", en: "Academic warning & dismissal" },
    items: [
      { ar: "إنذار لو المعدل التراكمي أقل من 2.00 بعد الترم التاني أو أي ترم بعده.", en: "Warning if the cumulative GPA is below 2.00 after the 2nd semester or any later one." },
      { ar: "الطالب تحت الملاحظة مايسجلش أكتر من 12 ساعة لحد ما معدله يوصل 2.00.", en: "A student on probation may not register more than 12 credits until the GPA reaches 2.00." },
      { ar: "الفصل بعد 3 أترام أساسية متتالية تحت 2.00، أو تجاوز 10 سنين دراسة.", en: "Dismissal after 3 consecutive main semesters below 2.00, or exceeding 10 years of study." },
      { ar: "تحسين التقدير: لحد 5 مقررات طول مدة الدراسة.", en: "Grade improvement: up to 5 courses over the whole study period." },
    ],
  },
  {
    id: "graduation",
    title: { ar: "متطلبات التخرج", en: "Graduation requirements" },
    items: [
      { ar: "160 ساعة معتمدة على الأقل، من غير أي تقدير أقل من D.", en: "At least 160 credit hours, with no grade below D." },
      { ar: "معدل تراكمي 2.00 على الأقل (C).", en: "A cumulative GPA of at least 2.00 (C)." },
      { ar: "النجاح في كل مشروعات التخرج وفي التدريب العملي والميداني.", en: "Passing all graduation projects plus the practical and field training." },
    ],
  },
  {
    id: "training",
    title: { ar: "التدريب والمشروعات", en: "Training & projects" },
    items: [
      { ar: "ARI 171: تدريب عملي داخل الجامعة، أسبوعين / 60 ساعة على الأقل.", en: "ARI 171: practical training at the university, at least 2 weeks / 60 hours." },
      { ar: "ARI 271 و ARI 371: تدريب ميداني خارجي، 4 أسابيع / 120 ساعة على الأقل، بشهادة رسمية.", en: "ARI 271 and ARI 371: external field training, at least 4 weeks / 120 hours, with an official certificate." },
      { ar: "التدريب نجاح/رسوب ومش بيتحسب في المعدل.", en: "Training is graded Pass/Fail and does not count in the GPA." },
      { ar: "مشروعات التخرج (ARI 381 و481 و482) في مجموعات من 5–8 طلاب.", en: "Graduation projects (ARI 381, 481, 482) are done in groups of 5–8 students." },
    ],
  },
]

export const gpaFormula: L = {
  ar: "المعدل = مجموع (نقاط التقدير × الساعات) ÷ مجموع الساعات",
  en: "GPA = Σ (grade points × credit hours) ÷ Σ credit hours",
}
