/**
 * Where student records come from. Pages and components never import the data file directly;
 * they go through these functions, so switching to the real backend only changes this file.
 *
 * NOW:   the six fictional students in src/data/demo/students.json (a copy of ai/data/students.json).
 *        The access code is the student's own student_id.
 * LATER: replace the bodies with calls to the backend, e.g.
 *          POST {API}/auth/login { code }  → the student (or 401)
 *          GET  {API}/students/{id}        → the full record
 *        keeping the same return types (see types.ts).
 */
import file from "@/data/demo/students.json"
import type { StudentFileEntry, StudentsFile } from "@/lib/data/types"

const data = file as StudentsFile

/** The term the demo data describes (also the "current" term for every student). */
export const dataTerm = data.generated_for_term

/** Checks an access code and returns the student it belongs to, or null if no student has it. */
export async function findStudentByAccessCode(code: string): Promise<StudentFileEntry | null> {
  const id = code.trim()
  return data.students.find((s) => s.student_id === id) ?? null
}

/** Full record of one student, or null if there is none with this id. */
export async function getStudent(studentId: string): Promise<StudentFileEntry | null> {
  return data.students.find((s) => s.student_id === studentId) ?? null
}

/** A code shown on the login page so the demo can be tried (the first student in the file). */
export const demoAccessCode = data.students[0]?.student_id ?? ""
