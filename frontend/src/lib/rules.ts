/**
 * Academic rules engine — deterministic, no LLM.
 * Prototype implementation in the browser; the real one belongs in the backend with the same logic.
 */
import {
  chainDepth,
  courses,
  electivePools,
  findCourse,
  termOf,
  type Category,
  type Course,
  type CourseType,
  type ElectiveGroup,
  type PoolCourse,
  type Term,
} from "@/lib/aie-program"

export type StudentRecord = {
  /** Cumulative GPA; null before the first term has results. */
  gpa: number | null
  /** On academic warning (probation): the load limit drops to the probation maximum. */
  onProbation?: boolean
  /** Passed course codes (including pool courses taken as electives). */
  passed: string[]
  /** Courses taken and failed, not yet passed. */
  failed: string[]
  /** Elective slot → chosen pool course (filled or intended). */
  electiveChoices: Record<string, string>
}

/** Max registration load by GPA, from "Academic Load per Semester" (same figures as ai/data/courses.json → rules). */
export const LOAD_BANDS = [
  { gpa_min: 0, gpa_max: 2, max_credits: 14 },
  { gpa_min: 2, gpa_max: 3, max_credits: 18 },
  { gpa_min: 3, gpa_max: 4.01, max_credits: 21 },
]
/** A first-term student has no GPA yet; the faculty allows 18 credit hours in that term. */
export const FIRST_TERM_MAX_LOAD = 18
/** A student on academic warning may not exceed 12 credit hours (Academic Warning section of the bylaws). */
export const PROBATION_MAX_LOAD = 12
/** Highest grade on a re-registered (retaken) course. */
export const RETAKE_MAX_GRADE = "B+"

/** Max registration load: 18 in the first term, 12 on academic warning, otherwise the GPA band in LOAD_BANDS. */
export function maxLoad(gpa: number | null, onProbation = false) {
  if (gpa === null) return FIRST_TERM_MAX_LOAD
  if (onProbation) return PROBATION_MAX_LOAD
  const band = LOAD_BANDS.find((b) => gpa >= b.gpa_min && gpa < b.gpa_max)
  return band?.max_credits ?? LOAD_BANDS.at(-1)!.max_credits
}
export const MIN_LOAD = 12

export function earnedCredits(r: StudentRecord) {
  return r.passed.reduce((s, code) => s + (findCourse(code)?.credits ?? 0), 0)
}

export type Status =
  | { kind: "passed" }
  | { kind: "failed"; eligibleToRetake: boolean; missing: string[] }
  | { kind: "eligible" }
  | { kind: "locked"; missing: string[]; creditsShort: number }

/** Can this student register `code` now? (Term availability is checked separately.) */
export function statusOf(code: string, r: StudentRecord): Status {
  const course = findCourse(code)
  if (!course) return { kind: "locked", missing: [], creditsShort: 0 }
  // Elective slot: passed when its chosen course is passed; otherwise eligible if any pool course is.
  if ("type" in course && course.type === "elective") {
    const chosen = r.electiveChoices[code]
    if (chosen && r.passed.includes(chosen)) return { kind: "passed" }
    const pool = electivePools[course.electiveGroup!].filter((p) => !r.passed.includes(p.code))
    return pool.some((p) => statusOf(p.code, r).kind === "eligible")
      ? { kind: "eligible" }
      : { kind: "locked", missing: [], creditsShort: 0 }
  }
  if (r.passed.includes(code)) return { kind: "passed" }
  const missing = course.prereqs.filter((p) => !r.passed.includes(p))
  const min = "minCredits" in course ? course.minCredits ?? 0 : 0
  const creditsShort = Math.max(0, min - earnedCredits(r))
  if (r.failed.includes(code)) return { kind: "failed", eligibleToRetake: missing.length === 0 && creditsShort === 0, missing }
  return missing.length === 0 && creditsShort === 0 ? { kind: "eligible" } : { kind: "locked", missing, creditsShort }
}

// ------------------------------------------------------------------------------ planning

export type PlanItem = {
  code: string
  credits: number
  category: Category
  type: CourseType
  prereqs: string[]
  minCredits: number
  /** Plan semester (1–10) that sets the term it is offered in. */
  semester: number
  term: Term
  /** Elective slot this course fills, e.g. "E2". */
  slot?: string
  group?: ElectiveGroup
}

/** Courses still needed to graduate, with elective slots resolved to the student's chosen courses. */
export function remainingItems(r: StudentRecord): PlanItem[] {
  const out: PlanItem[] = []
  for (const course of courses) {
    if (statusOf(course.code, r).kind === "passed") continue
    if (course.type === "elective") {
      const chosen = r.electiveChoices[course.code]
      const pool = chosen ? (findCourse(chosen) as PoolCourse) : undefined
      out.push({
        code: pool?.code ?? course.code,
        credits: 3,
        category: pool?.category ?? course.category,
        type: "elective",
        prereqs: pool?.prereqs ?? [],
        minCredits: 0,
        semester: course.semester,
        term: termOf(course.semester),
        slot: course.code.replace("ELEC ", ""),
        group: course.electiveGroup,
      })
    } else {
      out.push(toItem(course))
    }
  }
  return out
}

const toItem = (course: Course): PlanItem => ({
  code: course.code,
  credits: course.credits,
  category: course.category,
  type: course.type,
  prereqs: course.prereqs,
  minCredits: course.minCredits ?? 0,
  semester: course.semester,
  term: termOf(course.semester),
})

/**
 * Demo priority score (0–100): how urgent a course is for this student.
 * + depth of the prerequisite chain it starts (delaying it delays everything after it)
 * + on schedule in the study plan (semester ≤ the student's current plan semester)
 * + graduation projects
 */
export function priorityScore(item: PlanItem, currentSemester: number) {
  const depth = chainDepth(item.code)
  const onSchedule = item.semester <= currentSemester ? 15 : 0
  const projectBonus = item.type === "project" ? 10 : 0
  return Math.min(100, 60 + 12 * depth + onSchedule + projectBonus)
}

export type PlanOptions = {
  maxLoad: number
  startTerm: Term
  currentSemester: number
  /** Simulated failures: course code → term index in which it is failed. */
  failAt?: Record<string, number>
  horizon?: number
}

export type Plan = {
  terms: PlanItem[][]
  /** Index of the last term with courses (graduation term), or -1 if not everything fits in the horizon. */
  graduationIndex: number
  unplaced: PlanItem[]
}

/**
 * Greedy semester planner. Each term it takes the highest-priority courses that are offered that term,
 * whose prerequisites were passed in an earlier term and whose credit-hour threshold is met, up to the load limit.
 * Assumption: a course is offered only in the term (Fall/Spring) of its plan semester; no summer terms.
 */
export function planGraduation(r: StudentRecord, opts: PlanOptions): Plan {
  const passed = new Set(r.passed)
  let earned = earnedCredits(r)
  let remaining = remainingItems(r)
  const terms: PlanItem[][] = []
  const horizon = opts.horizon ?? 8

  for (let t = 0; t < horizon && remaining.length; t++) {
    const term: Term = t % 2 === 0 ? opts.startTerm : opts.startTerm === "fall" ? "spring" : "fall"
    const available = remaining
      .filter((i) => i.term === term && i.prereqs.every((p) => passed.has(p)) && earned >= i.minCredits)
      .sort((a, b) => priorityScore(b, opts.currentSemester) - priorityScore(a, opts.currentSemester) || a.semester - b.semester)
    const chosen: PlanItem[] = []
    let load = 0
    for (const i of available) {
      if (load + i.credits <= opts.maxLoad) {
        chosen.push(i)
        load += i.credits
      }
    }
    for (const i of chosen) {
      if (opts.failAt?.[i.code] === t) continue
      passed.add(i.code)
      earned += i.credits
      remaining = remaining.filter((x) => x !== i)
    }
    terms.push(chosen)
  }
  const last = terms.findLastIndex((x) => x.length > 0)
  return { terms, graduationIndex: remaining.length ? -1 : last, unplaced: remaining }
}
