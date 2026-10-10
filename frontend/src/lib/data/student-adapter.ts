/**
 * Turns one students.json record into the StudentRecord the rules engine works with.
 *
 * Only published results count. Courses of the term in progress are neither passed nor failed:
 * advice is based on where the student stands now, not on how the current term might end.
 */
import { electivePools, type ElectiveGroup } from "@/lib/aie-program"
import type { StudentRecord } from "@/lib/rules"
import type { StudentFileEntry } from "@/lib/data/types"

const FAIL = "F"
const SLOTS: Record<ElectiveGroup, string[]> = { L300: ["ELEC E1", "ELEC E2"], L400: ["ELEC E3", "ELEC E4", "ELEC E5"] }
const poolGroup = new Map<string, ElectiveGroup>(
  (Object.keys(electivePools) as ElectiveGroup[]).flatMap((g) => electivePools[g].map((p) => [p.code, g] as const))
)

/** Latest published grade per course code, in term order (a retake overrides the earlier attempt). */
export function latestGrades(s: StudentFileEntry): Map<string, string> {
  const out = new Map<string, string>()
  for (const term of s.terms) {
    if (term.status !== "published") continue
    for (const c of term.courses) if (c.grade) out.set(c.code, c.grade)
  }
  return out
}

/** Codes registered in the term that is in progress (no grades yet). */
export function registeredNow(s: StudentFileEntry): string[] {
  return s.terms.filter((t) => t.status === "in_progress").flatMap((t) => t.courses.map((c) => c.code))
}

export function toStudentRecord(s: StudentFileEntry): StudentRecord {
  const grades = latestGrades(s)
  const passed = [...grades].filter(([, g]) => g !== FAIL).map(([code]) => code)
  const failed = [...grades].filter(([, g]) => g === FAIL).map(([code]) => code)

  // Passed pool courses fill the elective slots of their level in the order they were taken.
  const electiveChoices: Record<string, string> = {}
  const free = { L300: [...SLOTS.L300], L400: [...SLOTS.L400] }
  for (const code of passed) {
    const g = poolGroup.get(code)
    const slot = g && free[g].shift()
    if (slot) electiveChoices[slot] = code
  }

  return {
    gpa: s.academic_status.cumulative_gpa,
    onProbation: s.academic_status.academic_standing.includes("إنذار"),
    passed,
    failed,
    electiveChoices,
  }
}
