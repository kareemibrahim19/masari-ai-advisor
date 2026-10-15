/**
 * Where student records come from. Pages and components never import the data file directly;
 * they go through these functions, so switching the backend only changes this file.
 *
 * The AI service (ai/chatbot/server.py) answers GET {API}/api/students/{id} from the database
 * (ai/data/students.json when the service has no database). When the service cannot be reached the
 * six fictional students in src/data/demo/students.json (a copy of ai/data/students.json) are used,
 * so a signed-in student can keep browsing when the service is briefly unreachable. Signing in itself always
 * goes through the server with a password (lib/auth.ts), never through this copy.
 */
import file from "@/data/demo/students.json"
import { apiFetch } from "@/lib/auth"
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
    const res = await apiFetch(`/api/students/${id}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    // Not found, or the token is not valid for this student: no record (the student signs in again).
    if (res.status === 404 || res.status === 401 || res.status === 403) return null
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as StudentFileEntry
  } catch {
    return demoStudent(id)
  }
}
