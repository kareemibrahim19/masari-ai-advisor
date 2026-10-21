"use client"

/**
 * Whether course registration is still open on the university's system, from the academic calendar
 * (lib/academic-calendar.ts): from "registration-opens" at its time until "add-drop" at its time (12 noon).
 * `masari.today` in localStorage moves the date for demos, like the reminders (lib/reminders.ts).
 */
import { calendarEvents } from "@/lib/academic-calendar"
import { useNow } from "@/lib/reminders"

const event = (id: string) => calendarEvents.find((e) => e.id === id)

/** The last day to add or drop a course: registration closes then. */
export const addDropEvent = event("add-drop")
const OPENS = `${event("registration-opens")?.date}T14:00`
const CLOSES = `${addDropEvent?.date}T12:00`

/** The last day to drop a course without a (W): paper registration closes then. */
export const dropWithoutWEvent = event("drop-without-w")
const PAPER_CLOSES = `${dropWithoutWEvent?.date}T12:00`

/** On the system until add/drop, then on paper (necessary cases, program administration) until the last day to drop
 * without a (W), then closed. null while rendering on the server. */
export function useRegistrationPhase(): "system" | "paper" | "closed" | null {
  const now = useNow()
  if (!now) return null
  return now < CLOSES ? "system" : now < PAPER_CLOSES ? "paper" : "closed"
}

/** true while registration is open, false once it closed (or before it opens), null while rendering on the server. */
export function useRegistrationOpen(): boolean | null {
  const now = useNow()
  if (!now) return null
  return now >= OPENS && now < CLOSES
}
