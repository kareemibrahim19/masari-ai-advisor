/**
 * Where student records come from. Pages and components never import the data file directly;
 * they go through these functions, so switching the backend only changes this file.
 *
 * The AI service (ai/chatbot/server.py) answers GET {API}/api/students/{id} from the database
 * (ai/data/students.json when the service has no database). When the service cannot be reached the
 * six fictional students in src/data/demo/students.json (a copy of ai/data/students.json) are used,
 * so the site still works offline. The access code is the student's own student_id.
 * LATER: a real sign-in, e.g. POST {API}/auth/login { code, password } → the student (or 401),
 * keeping the same return types (see types.ts).
 */
import file from "@/data/demo/students.json"
import { MASARI_API_URL } from "@/lib/api-url"
import type { StudentFileEntry, StudentsFile } from "@/lib/data/types"

const data = file as StudentsFile

/** The term the demo data describes (also the "current" term for every student). */
export const dataTerm = data.generated_for_term

/** A hosted service waking up (and reading the database) can take a few seconds; past this, use the copy. */
const TIMEOUT_MS = 10_000

const demoStudent = (id: string) => data.students.find((s) => s.student_id === id) ?? null

/** Full record of one student, or null if there is none with this id. */
export async function getStudent(studentId: string): Promise<StudentFileEntry | null> {
  const id = studentId.trim()
  if (!/^\d{1,16}$/.test(id)) return null
  try {
    const res = await fetch(`${MASARI_API_URL}/api/students/${id}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as StudentFileEntry
  } catch {
    return demoStudent(id)
  }
}

/** Checks an access code and returns the student it belongs to, or null if no student has it. */
export async function findStudentByAccessCode(code: string): Promise<StudentFileEntry | null> {
  return getStudent(code)
}
