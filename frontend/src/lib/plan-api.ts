/**
 * Graduation plan from the Masari AI service (POST /api/plan, ai/chatbot/tools/planner.py).
 * The plan is solved in Python against the regulations; the page only shows it.
 */
import * as React from "react"
import { apiFetch } from "@/lib/auth"

export type TargetYears = 4 | 4.5 | 5

export type PlanFlag =
  | "regular"
  | "summer_on_demand"
  | "training_summer"
  | "college_request"
  | "graduation_request"
  | "open_request"
  | "late_request"
  | "improvement"

export type PlanCourse = {
  code: string
  name_ar: string
  name_en: string | null
  credits: number
  type: "mandatory" | "elective" | "project" | "training"
  planned_semester: number | null
  flag: PlanFlag
  /** A project registered a few hours short of its requirement (within the tolerance): paper registration. */
  paper_registration?: boolean
  /** Opened for the student outside its semester (by request): not on the registration system, so on paper. */
  paper_opened?: boolean
  /** Hours earned before this semester, and the hours the project asks for (set with paper_registration). */
  hours_before?: number
  hours_needed?: number
  /** The grade the student has now in a course retaken to raise the GPA (set with the "improvement" flag). */
  current_grade?: string
  /** An elective: the slot it fills (E1..E5) and its pool's level. The student picks the course, so the page shows
   *  "Elective (n)" instead of the one the plan used for the hours and prerequisites. */
  elective_slot?: string
  elective_level?: number
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
  /** 15 hours on paper with a GPA under 2.00 (five 3-credit courses). */
  paper_load?: boolean
  /** The graduation semester under 12 hours, registered on paper. */
  below_minimum_paper?: boolean
  /** A semester the student froze (وقف قيد): no courses, and it does not count in the target. */
  frozen?: boolean
}

export type TermLabel = { ar: string; en: string }

/** Why a target is not possible, in plain words (worked out by the planner). */
export type WhyNot = {
  code: "past" | "course" | "hours" | "fit"
  ar: string
  en: string
  /** "course": the course that cannot make it, the course holding it back, and the chain between them. */
  course?: string
  root?: string
  chain?: string[]
}

/** Something the student can do to reach the target: attend a summer, or raise the cumulative GPA. */
export type PlanCondition = { kind: "summer" | "gpa"; ar: string; en: string }

/** "feasible": as things stand; "conditional": if the conditions are met; "impossible": no way within the rules. */
export type PlanStatus = "feasible" | "conditional" | "impossible"

export type GraduationPlan = {
  target_years: TargetYears
  allow_summer: boolean
  feasible: boolean
  status?: PlanStatus
  /** The conditions of the plan shown (status "conditional"). */
  conditions?: PlanCondition[]
  /** Every way that works on its own, e.g. a summer or a higher GPA. */
  routes?: { conditions: PlanCondition[]; graduation_term: TermLabel }[]
  /** The GPA it takes for 21 hours: from next semester ("from" 0) or the one after (1). */
  gpa_needed?: { from: 0 | 1; cap: number; term_gpa: number; next_term_gpa?: number }
  /** What a cumulative GPA under 2.00 would do to this target (status "feasible"). */
  risk?: { cap: number; still_possible: boolean; ar: string; en: string }
  /** GPA under 2.00 after this semester: graduation needs 2.00, and how many semesters are left before dismissal. */
  /** The student froze the current semester: the plan starts with the semester they return. */
  frozen?: { ar: string; en: string }
  /** A student under 2.00 now: the semester GPA this term that brings the cumulative GPA to 2.00, and whether
   *  missing it means another academic warning, or the dismissal limit. */
  this_term_goal?: {
    target: number
    term_gpa: number
    reachable: boolean
    warning_if_missed: boolean
    dismissal_if_missed: boolean
    hours: number
  }
  gpa_warning?: {
    cgpa: number
    semesters_left: number
    dismissal_reached: boolean
    next_term_gpa?: number
    average_term_gpa?: number
    ar: string
    en: string
  }
  /** "past": the target's last term is already behind the student; "constraints": the rules don't allow it. */
  reason_code?: "past" | "constraints"
  why?: WhyNot | null
  current_term: TermLabel
  current_main_semester: number
  after_this_term: { cumulative_gpa: number | null; term_gpa: number | null; earned_hours: number; max_credits: number }
  graduation_term: TermLabel | null
  terms: PlanTerm[]
  summer_courses?: string[]
  college_requests?: string[]
}

type OptionCell = {
  feasible: boolean
  status?: PlanStatus
  conditions?: PlanCondition[]
  graduation_term: TermLabel | null
  summer_courses: number
  college_requests: number
  why?: WhyNot | null
}
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
  const res = await apiFetch("/api/plan", {
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

// ---------------------------------------------------------------- shared by the plan page and the dashboard

/** The target and summer choice the student made on the plan page, saved per student in this browser. */
export type PlanChoice = { target: TargetYears; summer: boolean }

const DEFAULT_CHOICE = "5:1"
const choiceKey = (studentId: string) => `masari.plan.${studentId}`
const choiceListeners = new Set<() => void>()

function readChoice(studentId: string) {
  try {
    return localStorage.getItem(choiceKey(studentId)) ?? ""
  } catch {
    return ""
  }
}

function subscribeChoice(cb: () => void) {
  choiceListeners.add(cb)
  const onStorage = (e: StorageEvent) => e.key?.startsWith("masari.plan.") && cb()
  window.addEventListener("storage", onStorage)
  return () => {
    choiceListeners.delete(cb)
    window.removeEventListener("storage", onStorage)
  }
}

function parseChoice(raw: string): PlanChoice {
  const [t, s] = raw.split(":")
  return { target: t === "4" ? 4 : t === "4.5" ? 4.5 : 5, summer: s !== "0" }
}

/** `start`: the target shown before the student picks one (the one they finish in, for a student graduating this
 *  term; else the regulation plan). The student can still pick any other. */
export function usePlanChoice(studentId: string, start: TargetYears | null = null): [PlanChoice, (c: PlanChoice) => void] {
  const raw = React.useSyncExternalStore(subscribeChoice, () => readChoice(studentId), () => "")
  const choice = React.useMemo(() => parseChoice(raw || (start ? `${start}:1` : DEFAULT_CHOICE)), [raw, start])
  const set = React.useCallback(
    (c: PlanChoice) => {
      try {
        localStorage.setItem(choiceKey(studentId), `${c.target}:${c.summer ? 1 : 0}`)
      } catch {}
      choiceListeners.forEach((l) => l())
    },
    [studentId]
  )
  return [choice, set]
}

/**
 * Fetches the plan for a query. `loading` is true while the shown result belongs to an older query,
 * so callers can dim stale data instead of presenting it as current.
 */
export function useGraduationPlan(query: PlanQuery) {
  const [data, setData] = React.useState<PlanResponse | null>(null)
  const [error, setError] = React.useState<PlanError | Error | null>(null)
  // The request the shown result (or error) belongs to.
  const [settledKey, setSettledKey] = React.useState("")
  const [attempt, setAttempt] = React.useState(0)
  const key = `${JSON.stringify(query)}#${attempt}`

  React.useEffect(() => {
    const controller = new AbortController()
    fetchPlan(JSON.parse(key.slice(0, key.lastIndexOf("#"))) as PlanQuery, controller.signal)
      .then((d) => {
        setData(d)
        setError(null)
        setSettledKey(key)
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return
        setError(e)
        setSettledKey(key)
      })
    return () => controller.abort()
  }, [key])

  const retry = React.useCallback(() => setAttempt((n) => n + 1), [])
  return { data, error, loading: settledKey !== key, retry }
}

/** "Fall 2026", "Spring 2027", "Summer 2027": the calendar year the semester falls in (academic year 2026-2027). */
export function semesterLabel(term: "fall" | "spring" | "summer", academicYear: string, lang: "ar" | "en") {
  const start = parseInt(academicYear, 10)
  const year = term === "fall" ? start : start + 1
  const word = { fall: { ar: "خريف", en: "Fall" }, spring: { ar: "ربيع", en: "Spring" }, summer: { ar: "صيفي", en: "Summer" } }[term]
  return `${word[lang]} ${year}`
}
