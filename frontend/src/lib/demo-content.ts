/**
 * Demo content that is NOT student data, moved unchanged from mock-data.ts:
 * course-name lookup, regulation sources (RAG citations), simulated section seats, simulated instructors and their survey
 * profiles, the placeholder compatibility formula, default preferences, the plan assumption and chat suggestions.
 *
 * Student data comes from src/data/demo/students.json through lib/data/student-source.ts.
 * When the backend is ready, instructors, seats and preferences should come from it too.
 */
import { courseNameL } from "@/lib/aie-program"
import type { L } from "@/lib/i18n"

// ---------------------------------------------------------------- Course names (for UI lookups)

export const courseNames: Record<string, L> = new Proxy({} as Record<string, L>, {
  get: (_, code: string) => courseNameL(code),
})

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

// ---------------------------------------------------------------- Section seats (simulated)

export type Section = { id: string; seatsLeft: number; capacity: number }

/** Simulated section capacity. */
export const sectionsFor: Record<string, Section[]> = {
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

/** Summary of defaultPrefs, shown in the chat side panel (demo). */
export const defaultPrefsSummary: L = { ar: "شرح واضح وعبء دراسي متوسط", en: "Clear explanations, moderate workload" }

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

