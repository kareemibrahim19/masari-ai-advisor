/**
 * Graduation plan from the Masari AI service (POST /api/plan, ai/chatbot/tools/planner.py).
 * The plan is solved in Python against the regulations; the page only shows it.
 */
import { MASARI_API_URL } from "@/lib/demo-state"

export type TargetYears = 4 | 4.5 | 5

export type PlanFlag = "regular" | "summer_on_demand" | "training_summer" | "college_request" | "graduation_request"

export type PlanCourse = {
  code: string
  name_ar: string
  name_en: string | null
  credits: number
  type: "mandatory" | "elective" | "project" | "training"
  planned_semester: number | null
  flag: PlanFlag
}

export type PlanTerm = {
  ar: string
  en: string
  term: "fall" | "spring" | "summer"
  academic_year: string
  main_semester: number | null
  credits: number
  max_credits: number | null
  courses: PlanCourse[]
  warning?: string
}

export type TermLabel = { ar: string; en: string }

export type GraduationPlan = {
  target_years: TargetYears
  allow_summer: boolean
  feasible: boolean
  /** "past": the target's last term is already behind the student; "constraints": the rules don't allow it. */
  reason_code?: "past" | "constraints"
  current_term: TermLabel
  current_main_semester: number
  after_this_term: { cumulative_gpa: number | null; term_gpa: number | null; earned_hours: number; max_credits: number }
  graduation_term: TermLabel | null
  terms: PlanTerm[]
  summer_courses?: string[]
  college_requests?: string[]
}

type OptionCell = { feasible: boolean; graduation_term: TermLabel | null; summer_courses: number; college_requests: number }
export type PlanOption = { target_years: TargetYears; with_summer: OptionCell; without_summer: OptionCell }

export type PlanResponse = { plan: GraduationPlan; baseline: GraduationPlan | null; options: PlanOption[] }

export type PlanQuery = {
  studentId: string
  targetYears: TargetYears
  allowSummer: boolean
  failedCourses: string[]
  expectedTermGpa: number | null
}

export async function fetchPlan(q: PlanQuery, signal?: AbortSignal): Promise<PlanResponse> {
  const res = await fetch(`${MASARI_API_URL}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      student_id: q.studentId,
      target_years: q.targetYears,
      allow_summer: q.allowSummer,
      failed_courses: q.failedCourses,
      expected_term_gpa: q.expectedTermGpa,
    }),
    signal,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new PlanError(data.detail || `HTTP ${res.status}`, res.status)
  return data as PlanResponse
}

/** status 400 = the what-if input was rejected (e.g. a term GPA that the failed courses make impossible). */
export class PlanError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}
