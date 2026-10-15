/**
 * Seats per section, from the Masari AI service (ai/chatbot/seats.py):
 *   GET /api/sections   { term, courses: { [code]: [{ section, capacity, enrolled, seats_left, instructor_id }] } }
 * Sections offered this term only. If the service cannot be reached, the pages keep the simulated seats in
 * demo-content.ts.
 */
import { apiFetch } from "@/lib/auth"
import type { Section } from "@/lib/demo-content"

type ApiSection = { section: string; capacity: number; seats_left: number }

export async function fetchSections(signal?: AbortSignal): Promise<Record<string, Section[]>> {
  const res = await apiFetch("/api/sections", { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const courses = (await res.json()).courses as Record<string, ApiSection[]>
  return Object.fromEntries(
    Object.entries(courses).map(([code, list]) => [
      code,
      list.map((x) => ({ id: x.section, seatsLeft: x.seats_left, capacity: x.capacity })),
    ])
  )
}
