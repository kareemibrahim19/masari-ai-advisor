/**
 * What the student chose on the recommendations page (the courses on the schedule), saved per
 * student on the Masari AI service (ai/chatbot/student_choices.py), so a refresh or another device shows the same.
 *
 *   GET {API}/api/students/{id}/choices   { choices: SavedChoices | null }
 *   PUT {API}/api/students/{id}/choices   all of it, shortly after each change (the newest save wins)
 */
import { apiFetch } from "@/lib/auth"

export type SavedChoices = {
  selected: string[]
}

const choicesUrl = (studentId: string) => `/api/students/${encodeURIComponent(studentId)}/choices`

/** The saved choices, or null if the student has none yet. Rejects when the service cannot be reached. */
export async function fetchChoices(studentId: string, signal?: AbortSignal): Promise<SavedChoices | null> {
  const res = await apiFetch(choicesUrl(studentId), { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const c = (await res.json()).choices as SavedChoices | null
  if (!c || !Array.isArray(c.selected)) return null
  return { selected: c.selected }
}

/** Saves the choices to the account. Failures are ignored: the page keeps them until the next refresh. */
export function pushChoices(studentId: string, choices: SavedChoices) {
  apiFetch(choicesUrl(studentId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...choices, updatedAt: Date.now() }),
    keepalive: true,
  }).catch(() => {})
}
