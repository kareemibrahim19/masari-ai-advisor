/**
 * Demo data for the UI prototype.
 *
 * REAL (from the AIE Program Guide, see aie-program.ts): course codes, names, credits, prerequisites,
 * elective pools, load limits and other regulations.
 * SIMULATED: the student (Ahmed) and his record, instructors, survey counts, section seats.
 *
 * Recommendations, eligibility, the study plan and what-if results are COMPUTED by the rules engine
 * (rules.ts) from the record — not written by hand. Keep these shapes as the frontend ↔ backend contract draft.
 */
import {
  allDependentsOf,
  categoryLabels,
  courseNameL,
  courses,
  dependentsOf,
  electivePools,
  findCourse,
  type Category,
} from "@/lib/aie-program"
import type { L } from "@/lib/i18n"
import {
  earnedCredits,
  maxLoad,
  MIN_LOAD,
  planGraduation,
  priorityScore,
  remainingItems,
  type PlanItem,
  type StudentRecord,
} from "@/lib/rules"

export type { Category }

// ---------------------------------------------------------------- Sources (RAG citations)

export type Source = { id: string; title: L; locator: L }

export const sources: Record<string, Source> = {
  catalog: {
    id: "catalog",
    title: { ar: "دليل البرنامج", en: "Program guide" },
    locator: { ar: "المقررات والمتطلبات", en: "Courses & prerequisites" },
  },
  load: {
    id: "load",
    title: { ar: "اللائحة", en: "Regulations" },
    locator: { ar: "العبء الدراسي", en: "Academic load" },
  },
  retake: {
    id: "retake",
    title: { ar: "اللائحة", en: "Regulations" },
    locator: { ar: "إعادة التسجيل", en: "Re-registration" },
  },
  training: {
    id: "training",
    title: { ar: "اللائحة", en: "Regulations" },
    locator: { ar: "التدريب والمشروعات", en: "Training & projects" },
  },
  graduation: {
    id: "graduation",
    title: { ar: "اللائحة", en: "Regulations" },
    locator: { ar: "متطلبات التخرج", en: "Graduation requirements" },
  },
}

// ---------------------------------------------------------------- Student (simulated record)

const sems = (...n: number[]) => courses.filter((c) => n.includes(c.semester) && c.type !== "elective").map((c) => c.code)

/**
 * Ahmed finished semesters 1–6, then in semester 7 passed four courses and Elective (1),
 * but failed Neural Networks (ECE 332). He is registering for semester 8 (Spring 2027).
 */
export const record: StudentRecord = {
  gpa: 2.4,
  passed: [...sems(1, 2, 3, 4, 5, 6), "CSE 331", "CSE 313", "CSE 317", "ECE 333", "BAS 311"],
  failed: ["ECE 332"],
  electiveChoices: { "ELEC E1": "BAS 311", "ELEC E2": "ECE 334", "ELEC E3": "ECE 435", "ELEC E4": "ECE 432", "ELEC E5": "CSE 413" },
}

export const CURRENT_SEMESTER = 8
const earned = earnedCredits(record)
const limit = maxLoad(record.gpa)

// Spring 2027, Fall 2027, Spring 2028, …
export const semesterNames: L[] = Array.from({ length: 8 }, (_, i) => {
  const year = 2027 + Math.floor(i / 2)
  return i % 2 === 0 ? { ar: `ربيع ${year}`, en: `Spring ${year}` } : { ar: `خريف ${year}`, en: `Fall ${year}` }
})

const planOpts = { maxLoad: limit, startTerm: "spring" as const, currentSemester: CURRENT_SEMESTER }
const baseline = planGraduation(record, planOpts)

export const student = {
  id: "DEMO-AIE-0147",
  name: { ar: "أحمد", en: "Ahmed" },
  fullName: { ar: "أحمد سامي", en: "Ahmed Samy" },
  program: { ar: "هندسة الذكاء الاصطناعي", en: "AI Engineering" },
  level: { ar: "المستوى 3", en: "Level 3" },
  gpa: record.gpa,
  earned,
  total: 160,
  maxLoad: limit,
  maxLoadRule: {
    ar: "معدل من 2.00 لأقل من 3.00 ← حد أقصى 18 ساعة",
    en: "2.00 ≤ GPA < 3.00 → up to 18 credit hours",
  },
  estGraduation: semesterNames[baseline.graduationIndex],
  preferences: {
    summary: { ar: "شرح واضح وعبء دراسي متوسط", en: "Clear explanations, moderate workload" },
  },
  completed: record.passed,
}

// ---------------------------------------------------------------- Progress (computed from the record)

export type RequirementGroup = { id: string; name: L; earned: number; required: number }

const order: Category[] = ["UNR", "BAS", "ENG", "PDE", "ELE", "ECE", "CSE", "ARI"]
export const requirementGroups: RequirementGroup[] = [
  ...order.map((cat) => {
    const list = courses.filter((c) => c.category === cat && c.type !== "elective")
    return {
      id: cat,
      name: categoryLabels[cat],
      required: list.reduce((s, c) => s + c.credits, 0),
      earned: list.filter((c) => record.passed.includes(c.code)).reduce((s, c) => s + c.credits, 0),
    }
  }),
  (() => {
    const slots = courses.filter((c) => c.type === "elective")
    const done = slots.filter((s) => record.passed.includes(record.electiveChoices[s.code] ?? "")).length
    return { id: "elective", name: { ar: "المقررات الاختيارية", en: "Electives" }, required: slots.length * 3, earned: done * 3 }
  })(),
]

export type ElectiveCategory = { id: string; name: L; done: number; required: number }

export const electiveCategories: ElectiveCategory[] = (["L300", "L400"] as const).map((g) => {
  const slots = courses.filter((c) => c.electiveGroup === g)
  return {
    id: g,
    name: { ar: `اختياري المستوى ${g === "L300" ? 3 : 4} (${g})`, en: `Level ${g === "L300" ? 3 : 4} electives (${g})` },
    required: slots.length,
    done: slots.filter((s) => record.passed.includes(record.electiveChoices[s.code] ?? "")).length,
  }
})

// ---------------------------------------------------------------- Alerts

export type Alert = { id: string; kind: "warning" | "info" | "seat"; title: L; body: L; sourceId?: string }

const gatedByNN = allDependentsOf("ECE 332").length
const ft2 = findCourse("ARI 371") as { minCredits?: number }

export const alerts: Alert[] = [
  {
    id: "nn",
    kind: "warning",
    title: { ar: "رسوب في Neural Networks", en: "Failed Neural Networks" },
    body: {
      ar: `متطلب سابق لـ ${gatedByNN} مقررات (مباشر وغير مباشر) منهم Deep Learning. بيتدرّس في الخريف بس حسب الخطة، فأقرب إعادة خريف 2027.`,
      en: `It gates ${gatedByNN} courses (directly or indirectly), including Deep Learning. It is a Fall course in the plan, so the earliest retake is Fall 2027.`,
    },
    sourceId: "catalog",
  },
  {
    id: "retake",
    kind: "info",
    title: { ar: "قاعدة إعادة التسجيل", en: "Re-registration rule" },
    body: {
      ar: "لما تعيد مقرر سقطت فيه، أعلى تقدير ممكن تاخده B+.",
      en: "When you re-register a failed course, the highest grade you can get is B+.",
    },
    sourceId: "retake",
  },
  {
    id: "ft2",
    kind: "info",
    title: { ar: "التدريب الميداني (2) لسه مقفول", en: "Field Training (2) is still locked" },
    body: {
      ar: `محتاج ${ft2.minCredits} ساعة مكتسبة، ومعاك ${earned}. فاضلك ${(ft2.minCredits ?? 0) - earned} ساعة.`,
      en: `It requires ${ft2.minCredits} earned credits and you have ${earned}, so ${(ft2.minCredits ?? 0) - earned} to go.`,
    },
    sourceId: "training",
  },
  {
    id: "seat",
    kind: "seat",
    title: { ar: "سكشن 1 في Communication Networks مكتمل", en: "Communication Networks section 1 is full" },
    body: {
      ar: "سكشن 2 فيه 8 مقاعد متاحة. لو محتاج سكشن 1 تقدر تبعت طلب فتح مقعد.",
      en: "Section 2 has 8 seats left. If you need section 1, you can send a seat request.",
    },
  },
]

// ---------------------------------------------------------------- Course names (for UI lookups)

export const courseNames: Record<string, L> = new Proxy({} as Record<string, L>, {
  get: (_, code: string) => courseNameL(code),
})

export const categoryLabel = categoryLabels

// ---------------------------------------------------------------- Recommendations for Spring 2027 (computed)

export type Section = { id: string; seatsLeft: number; capacity: number }

export type RecommendedCourse = {
  code: string
  name: L
  credits: number
  category: Category
  priority: number
  prereqs: string[]
  unlocks: string[]
  sections: Section[]
  verifiedReasons: L[]
  aiReason: L
  slot?: string
}

/** Simulated section capacity. */
const sectionsFor: Record<string, Section[]> = {
  "ECE 321": [
    { id: "1", seatsLeft: 0, capacity: 45 },
    { id: "2", seatsLeft: 8, capacity: 45 },
    { id: "3", seatsLeft: 19, capacity: 40 },
  ],
  "CSE 315": [
    { id: "1", seatsLeft: 12, capacity: 40 },
    { id: "2", seatsLeft: 21, capacity: 40 },
  ],
}

/** LLM-style explanations (placeholder text; the real ones are generated from the verified facts). */
const aiReasons: Record<string, L> = {
  "ECE 321": {
    ar: "مقرر الخطة الطبيعي للترم ده، وهو المتطلب الوحيد لاختياري IoT اللي اخترته، فتأجيله هيأخّر الاختياري.",
    en: "It is on schedule for this term and it is the only prerequisite for the IoT elective you chose, so delaying it delays that elective.",
  },
  "ARI 381": {
    ar: "مشروع التخرج (1) بيتسجل في الربيع بس، وإنت عديت شرط الـ 96 ساعة. ابدأ بدري عشان تكوّن فريق من 2–3.",
    en: "Project (1) is a Spring course and you meet the 96-credit condition. Start early so you can form a team of 2–3.",
  },
  "CSE 315": {
    ar: "إجباري في موعده، ومتطلبه Computer Architecture لسه طازة معاك من الترم اللي فات.",
    en: "Mandatory and on schedule, and you just finished its prerequisite, Computer Architecture.",
  },
  "ENG 312": {
    ar: "ساعتين بس ومن غير متطلبات، فبيكمّل الحمل من غير ضغط ويفيدك في المشروع.",
    en: "Only 2 credits with no prerequisites. It rounds out the load lightly and helps with the project.",
  },
  "ECE 334": {
    ar: "اختيارك لخانة E2. قريب من مسار الـ AI ومتطلبه BAS 218 مستوفى.",
    en: "Your pick for slot E2. It fits the AI track and its prerequisite BAS 218 is met.",
  },
  "CSE 451": {
    ar: "مكانه في الخطة الترم العاشر، بس متطلبه مستوفى. أخده دلوقتي بيخفف آخر سنة.",
    en: "Planned for semester 10, but its prerequisite is met. Taking it now lightens your final year.",
  },
  "CSE 413": {
    ar: "اختيارك لخانة E5. متاح من دلوقتي، بس هيعدّي بيك فوق الحد لو أخدته مع الباقي.",
    en: "Your pick for slot E5. It is available now, but it would push you over the limit with the rest.",
  },
}

const listCodes = (codes: string[]) => codes.join("، ")
const listCodesEn = (codes: string[]) => codes.join(", ")

function verifiedReasonsFor(i: PlanItem): L[] {
  const out: L[] = []
  if (i.prereqs.length) out.push({ ar: `المتطلبات السابقة مستوفاة: ${listCodes(i.prereqs)}`, en: `Prerequisites met: ${listCodesEn(i.prereqs)}` })
  else if (!i.minCredits) out.push({ ar: "بدون متطلبات سابقة", en: "No prerequisites" })
  if (i.minCredits) out.push({ ar: `يتطلب ≥ ${i.minCredits} ساعة، ومعاك ${earned}`, en: `Requires ≥ ${i.minCredits} credits; you have ${earned}` })
  if (i.slot) out.push({ ar: `يملأ خانة الاختياري ${i.slot} (${i.group})`, en: `Fills elective slot ${i.slot} (${i.group})` })
  else if (i.semester === CURRENT_SEMESTER) out.push({ ar: `في موعده حسب الخطة (الفصل ${i.semester})`, en: `On schedule (plan semester ${i.semester})` })
  else if (i.semester > CURRENT_SEMESTER) out.push({ ar: `متقدم عن الخطة (الفصل ${i.semester})`, en: `Ahead of plan (semester ${i.semester})` })
  const deps = dependentsOf(i.code)
  if (deps.length) out.push({ ar: `متطلب سابق لـ: ${listCodes(deps)}`, en: `Prerequisite for: ${listCodesEn(deps)}` })
  return out
}

const remaining = remainingItems(record)
const offeredNow = remaining.filter((i) => i.term === "spring")
const eligibleNow = offeredNow.filter((i) => i.prereqs.every((p) => record.passed.includes(p)) && earned >= i.minCredits)

export const recommendedCourses: RecommendedCourse[] = eligibleNow
  .map((i) => ({
    code: i.code,
    name: courseNameL(i.code),
    credits: i.credits,
    category: i.category,
    priority: priorityScore(i, CURRENT_SEMESTER),
    prereqs: i.prereqs,
    unlocks: dependentsOf(i.code),
    sections: sectionsFor[i.code] ?? [{ id: "1", seatsLeft: 15, capacity: 40 }],
    verifiedReasons: verifiedReasonsFor(i),
    aiReason: aiReasons[i.code] ?? { ar: "", en: "" },
    slot: i.slot,
  }))
  .sort((a, b) => b.priority - a.priority || a.code.localeCompare(b.code))

/** What the planner registers this term — the default selection in the UI. */
export const proposedNow = baseline.terms[0].map((i) => i.code)

export type IneligibleCourse = { code: string; name: L; credits: number; reason: L; sourceId: string }

export const ineligibleCourses: IneligibleCourse[] = [
  ...offeredNow
    .filter((i) => !eligibleNow.includes(i))
    .map((i) => {
      const missing = i.prereqs.filter((p) => !record.passed.includes(p))
      const reason: L = missing.length
        ? { ar: `ناقص المتطلب السابق ${listCodes(missing)}`, en: `Missing prerequisite ${listCodesEn(missing)}` }
        : { ar: `يتطلب ${i.minCredits} ساعة مكتسبة (معاك ${earned})`, en: `Requires ${i.minCredits} earned credits (you have ${earned})` }
      return { code: i.code, name: courseNameL(i.code), credits: i.credits, reason, sourceId: missing.length ? "catalog" : "training" }
    }),
  // Failed course that cannot be retaken this term because it is offered in Fall only.
  ...remaining
    .filter((i) => record.failed.includes(i.code) && i.term !== "spring")
    .map((i) => ({
      code: i.code,
      name: courseNameL(i.code),
      credits: i.credits,
      reason: { ar: "إعادة: بيتدرّس في الخريف فقط حسب الخطة", en: "Retake: offered in Fall only per the plan" },
      sourceId: "catalog",
    })),
]

// ---------------------------------------------------------------- Instructors (simulated)

/** Survey-derived teaching dimensions, 0–100. Higher pace = faster, higher workload = heavier. */
export type TeachingProfile = {
  clarity: number
  pace: number
  workload: number
  practical: number
  difficulty: number
  satisfaction: number
}

export type Instructor = {
  id: string
  name: L
  courseCode: string
  section: string
  responses: number
  profile: TeachingProfile
  aiSummary: L
}

export const instructors: Instructor[] = [
  {
    id: "i1",
    name: { ar: "د. سارة محمود", en: "Dr. Sara Mahmoud" },
    courseCode: "ECE 321",
    section: "1",
    responses: 142,
    profile: { clarity: 88, pace: 45, workload: 50, practical: 70, difficulty: 55, satisfaction: 84 },
    aiSummary: {
      ar: "التقييمات السابقة بتقول إن شرحها واضح والسرعة متوسطة، وده متماشي مع تفضيلك للشرح الواضح والعبء المتوسط.",
      en: "Historical feedback points to clear explanations and a moderate pace, which matches your preference for clarity and a moderate workload.",
    },
  },
  {
    id: "i2",
    name: { ar: "د. عمرو خليل", en: "Dr. Amr Khalil" },
    courseCode: "ECE 321",
    section: "2",
    responses: 97,
    profile: { clarity: 70, pace: 82, workload: 85, practical: 80, difficulty: 82, satisfaction: 72 },
    aiSummary: {
      ar: "مناسب للطلاب اللي عايزين تحدي ومعامل متقدمة، لكن السرعة والعبء أعلى من تفضيلاتك الحالية.",
      en: "A good fit for students who want a challenge and advanced labs, but the pace and workload exceed your current preferences.",
    },
  },
  {
    id: "i3",
    name: { ar: "د. ليلى حسن", en: "Dr. Laila Hassan" },
    courseCode: "ECE 321",
    section: "3",
    responses: 9,
    profile: { clarity: 80, pace: 50, workload: 40, practical: 55, difficulty: 45, satisfaction: 79 },
    aiSummary: {
      ar: "المؤشرات الأولية إيجابية وقريبة من تفضيلاتك، لكن عدد التقييمات قليل جدًا.",
      en: "Early signals are positive and close to your preferences, but there are very few responses.",
    },
  },
  {
    id: "i4",
    name: { ar: "د. هاني فاروق", en: "Dr. Hany Farouk" },
    courseCode: "CSE 315",
    section: "1",
    responses: 64,
    profile: { clarity: 76, pace: 60, workload: 65, practical: 85, difficulty: 60, satisfaction: 77 },
    aiSummary: {
      ar: "أسلوب عملي جدًا بمشروع hardware كامل، والعبء أعلى شوية من المتوسط.",
      en: "Very hands-on with a full hardware project; workload is slightly above average.",
    },
  },
  {
    id: "i5",
    name: { ar: "د. منى عادل", en: "Dr. Mona Adel" },
    courseCode: "CSE 315",
    section: "2",
    responses: 120,
    profile: { clarity: 85, pace: 40, workload: 45, practical: 50, difficulty: 50, satisfaction: 82 },
    aiSummary: {
      ar: "شرح منظم وسرعة هادية، مناسب لو عايز تفهم الأساسيات كويس قبل الجزء العملي.",
      en: "Structured explanations at a calm pace. A good fit if you want solid fundamentals before practice.",
    },
  },
]

export const dimensionLabels: Record<keyof TeachingProfile, L> = {
  clarity: { ar: "وضوح الشرح", en: "Teaching clarity" },
  pace: { ar: "سرعة الشرح", en: "Teaching pace" },
  workload: { ar: "العبء الدراسي", en: "Workload" },
  practical: { ar: "عملي مقابل نظري", en: "Practical vs. theoretical" },
  difficulty: { ar: "صعوبة التقييم", en: "Assessment difficulty" },
  satisfaction: { ar: "رضا الطلاب", en: "Student satisfaction" },
}

export type StudentPrefs = { pace: number; workload: number; practical: number }

export const defaultPrefs: StudentPrefs = { pace: 40, workload: 50, practical: 65 }

/**
 * PLACEHOLDER scoring so the UI can react to preference changes.
 * The real score will come from the student–instructor compatibility model.
 */
export function demoCompatibility(p: TeachingProfile, prefs: StudentPrefs) {
  const paceFit = 100 - Math.abs(p.pace - prefs.pace)
  const workloadFit = 100 - Math.max(0, p.workload - prefs.workload) * 1.2
  const practicalFit = 100 - Math.abs(p.practical - prefs.practical)
  const fit = (paceFit + workloadFit + practicalFit) / 3
  return Math.round(Math.max(0, Math.min(100, 0.6 * fit + 0.25 * p.clarity + 0.15 * p.satisfaction)))
}

export function confidenceFromResponses(n: number): "high" | "medium" | "low" {
  if (n >= 50) return "high"
  if (n >= 20) return "medium"
  return "low"
}

// ---------------------------------------------------------------- Study plan + what-if (computed)

export type PlannedCourse = { code: string; credits: number; category: Category; requires: string[]; slot?: string; minCredits?: number }

const toPlanned = (terms: PlanItem[][]): PlannedCourse[][] =>
  terms.map((t) => t.map((i) => ({ code: i.code, credits: i.credits, category: i.category, requires: i.prereqs, slot: i.slot, minCredits: i.minCredits || undefined })))

export const baselinePlan = toPlanned(baseline.terms)
export const baselineGraduationIndex = baseline.graduationIndex
export const minLoad = MIN_LOAD

export type Scenario = {
  id: string
  label: L
  plan: PlannedCourse[][]
  graduationIndex: number
  verdict: "delay" | "same" | "infeasible"
  graduation: L
  summary: L
  ruleNote: L
  /** Courses whose term differs from the baseline plan. */
  affected: string[]
}

const termIndex = (plan: PlannedCourse[][]) => new Map(plan.flatMap((t, i) => t.map((c) => [c.code, i] as const)))

function scenario(id: string, label: L, opts: Partial<Parameters<typeof planGraduation>[1]>, ruleNote: L, extra: (s: { gradIdx: number; affected: string[] }) => L): Scenario {
  const p = planGraduation(record, { ...planOpts, ...opts })
  const plan = toPlanned(p.terms)
  const before = termIndex(baselinePlan)
  const after = termIndex(plan)
  const affected = [...before.keys()].filter((code) => before.get(code) !== after.get(code))
  const gradIdx = p.graduationIndex
  const verdict = gradIdx > baseline.graduationIndex || gradIdx === -1 ? "delay" : "same"
  return {
    id,
    label,
    plan,
    graduationIndex: gradIdx,
    verdict,
    graduation: gradIdx === -1 ? { ar: "بعد أكثر من 4 سنين", en: "Beyond 4 years" } : semesterNames[gradIdx],
    summary: extra({ gradIdx, affected }),
    ruleNote,
    affected,
  }
}

const name = (code: string) => courseNameL(code).en
const dlIndex = baselinePlan.findIndex((t) => t.some((c) => c.code === "CSE 351"))

export const scenarios: Scenario[] = [
  scenario(
    "fail-dl",
    { ar: "لو سقطت في Deep Learning", en: "What if I fail Deep Learning?" },
    { failAt: { "CSE 351": dlIndex } },
    { ar: "CSE 452 يتطلب CSE 351، والاتنين بيتدرّسوا في الربيع بس", en: "CSE 452 requires CSE 351, and both are Spring-only" },
    ({ gradIdx, affected }) => ({
      ar: `هتعيد ${name("CSE 351")} الربيع اللي بعده، وده هيأخر ${name("CSE 452")} سنة كمان. التخرج يبقى ${semesterNames[gradIdx]?.ar ?? "—"}. المقررات المتأثرة: ${affected.length}.`,
      en: `You retake ${name("CSE 351")} the following Spring, which pushes ${name("CSE 452")} back another year. Graduation moves to ${semesterNames[gradIdx]?.en ?? "—"}. Affected courses: ${affected.length}.`,
    })
  ),
  scenario(
    "fail-ece321",
    { ar: "لو سقطت في Communication Networks", en: "What if I fail Communication Networks?" },
    { failAt: { "ECE 321": 0 } },
    { ar: "ECE 432 (IoT) يتطلب ECE 321", en: "ECE 432 (IoT) requires ECE 321" },
    ({ gradIdx }) => ({
      ar: `هتعيده ربيع 2028 واختياري IoT هيتأجل للخريف اللي بعده. موعد التخرج ${gradIdx === baseline.graduationIndex ? "مش هيتغير" : "هيتأخر"}، لأن سلسلة Deep Learning هي اللي محددة موعد تخرجك.`,
      en: `You retake it in Spring 2028 and the IoT elective moves to the following Fall. Graduation ${gradIdx === baseline.graduationIndex ? "does not change" : "is delayed"}, because the Deep Learning chain sets your graduation date.`,
    })
  ),
  scenario(
    "gpa3",
    { ar: "لو معدلي وصل 3.00 (حد 21 ساعة)", en: "What if my GPA reaches 3.00 (21-credit limit)?" },
    { maxLoad: 21 },
    { ar: "معدل ≥ 3.00 ← حد أقصى 21 ساعة", en: "GPA ≥ 3.00 → up to 21 credit hours" },
    ({ gradIdx }) => ({
      ar: `هتقدر تسجّل مقررات أكتر بدري، بس التخرج ${gradIdx === baseline.graduationIndex ? "هيفضل زي ما هو" : "هيتغير"}. اللي مأخرك هو سلسلة المتطلبات، مش عدد الساعات.`,
      en: `You can take more courses earlier, but graduation ${gradIdx === baseline.graduationIndex ? "stays the same" : "changes"}. Your bottleneck is the prerequisite chain, not the credit limit.`,
    })
  ),
  {
    id: "spring-2028",
    label: { ar: "أقدر أتخرج ربيع 2028؟", en: "Can I graduate in Spring 2028?" },
    plan: baselinePlan,
    graduationIndex: baseline.graduationIndex,
    verdict: "infeasible",
    graduation: { ar: "غير ممكن بالقواعد الحالية", en: "Not possible under current rules" },
    summary: {
      ar: `لأ. Neural Networks بيتدرّس في الخريف بس (أقرب مرة خريف 2027)، وبعده Deep Learning في الربيع (ربيع 2028)، وبعده AI Applications في الربيع اللي بعده. فأقرب تخرج ${semesterNames[baseline.graduationIndex].ar}.`,
      en: `No. Neural Networks is Fall-only (earliest Fall 2027), Deep Learning follows in Spring 2028, and AI Applications needs the Spring after that. The earliest graduation is ${semesterNames[baseline.graduationIndex].en}.`,
    },
    ruleNote: { ar: "ECE 332 (خريف) ← CSE 351 (ربيع) ← CSE 452 (ربيع)", en: "ECE 332 (Fall) → CSE 351 (Spring) → CSE 452 (Spring)" },
    affected: [],
  },
]

/** Assumption shown in the plan UI. */
export const planAssumption: L = {
  ar: "افتراض: كل مقرر بيتدرّس في فصل الخطة بتاعه بس (الفردي خريف والزوجي ربيع)، ومن غير ترم صيفي.",
  en: "Assumption: each course is offered only in its plan term (odd = Fall, even = Spring), with no summer term.",
}

// ---------------------------------------------------------------- Chat seed

export const chatSuggestions: L[] = [
  { ar: "أسجل إيه الترم الجاي؟", en: "What should I register for next semester?" },
  { ar: "ليه مش قادر أسجل Deep Learning؟", en: "Why can't I register for Deep Learning?" },
  { ar: "فاضلي كام ساعة للتخرج؟", en: "How many credit hours do I have left?" },
  { ar: "مين أنسب دكتور ليا في Communication Networks؟", en: "Which Communication Networks instructor suits me best?" },
]

export { electivePools }
