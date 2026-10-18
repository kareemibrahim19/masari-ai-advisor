/**
 * Demo content that is NOT student data, moved unchanged from mock-data.ts:
 * course-name lookup, regulation sources (RAG citations), simulated section seats, the plan assumption and chat suggestions.
 *
 * Student data comes from src/data/demo/students.json through lib/data/student-source.ts.
 * When the backend is ready, seats should come from it too (instructor recommendations already do: lib/data/instructor-grades-source.ts).
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

/** Assumption shown in the plan UI. */
export const planAssumption: L = {
  ar: "افتراض: كل مقرر بيتدرّس في فصل الخطة بتاعه بس (الفردي خريف والزوجي ربيع)، ومن غير ترم صيفي.",
  en: "Assumption: each course is offered only in its plan semester (odd = Fall, even = Spring), with no summer semester.",
}

// ---------------------------------------------------------------- Chat suggestions

export const chatSuggestions: L[] = [
  { ar: "لو معدلي بين 2 و3، أقدر أسجل كام ساعة؟", en: "If my GPA is between 2 and 3, how many credit hours can I register?" },
  { ar: "أقدر أسجل كام ساعة الترم ده؟", en: "How many credit hours can I register this semester?" },
  { ar: "إمتى أقدر أسجل مشروع التخرج؟", en: "When can I register the graduation project?" },
  { ar: "إيه اللي يحصل لو معدلي نزل تحت 2؟", en: "What happens if my GPA drops below 2?" },
  { ar: "أقدر آخد كام مادة في الترم الصيفي؟", en: "How many courses can I take in the summer semester?" },
  { ar: "فاضلي كام ساعة عشان أتخرج؟", en: "How many credit hours do I have left to graduate?" },
]

