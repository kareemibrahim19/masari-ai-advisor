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

/** The last day to drop a course without a (W): paper registration (necessary cases) stays possible until then. */
export const dropWithoutWEvent = event("drop-without-w")

/** Days after registration closes that the not-registered notices stay up; after that nothing is shown. */
const NOTICE_GRACE_DAYS = 3
const NOTICE_ENDS = (() => {
  const d = new Date(`${addDropEvent?.date}T12:00`)
  d.setDate(d.getDate() + NOTICE_GRACE_DAYS)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T23:59`
})()

/** "system": open on the system. "paper": closed, notice still up for a few days. "gone": no notice. null on the server. */
export function useRegistrationPhase(): "system" | "paper" | "gone" | null {
  const now = useNow()
  if (!now) return null
  return now < CLOSES ? "system" : now <= NOTICE_ENDS ? "paper" : "gone"
}

/** true while registration is open, false once it closed (or before it opens), null while rendering on the server. */
export function useRegistrationOpen(): boolean | null {
  const now = useNow()
  if (!now) return null
  return now >= OPENS && now < CLOSES
}
