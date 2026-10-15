/**
 * What the student chose on the recommendations page (courses, preference sliders, hidden instructors), saved per
 * student on the Masari AI service (ai/chatbot/student_choices.py), so a refresh or another device shows the same.
 *
 *   GET {API}/api/students/{id}/choices   { choices: SavedChoices | null }
 *   PUT {API}/api/students/{id}/choices   all of it, shortly after each change (the newest save wins)
 */
import { apiFetch } from "@/lib/auth"
import type { StudentPrefs } from "@/lib/demo-content"

export type SavedChoices = {
  selected: string[]
  /** null until the student moves a slider (or asks the chat for a teaching style) */
  prefs: StudentPrefs | null
  excluded: string[]
}

const choicesUrl = (studentId: string) => `/api/students/${encodeURIComponent(studentId)}/choices`

/** The saved choices, or null if the student has none yet. Rejects when the service cannot be reached. */
export async function fetchChoices(studentId: string, signal?: AbortSignal): Promise<SavedChoices | null> {
  const res = await apiFetch(choicesUrl(studentId), { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const c = (await res.json()).choices as SavedChoices | null
  if (!c || !Array.isArray(c.selected)) return null
  return { selected: c.selected, prefs: c.prefs ?? null, excluded: Array.isArray(c.excluded) ? c.excluded : [] }
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
