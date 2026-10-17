"use client"

/**
 * For each course of the current term, how many semesters later the student graduates without passing it, from
 * the AI service's graduation planner (GET /api/students/{id}/graduation-delays, ai/chatbot/tools/priorities.py),
 * which counts summer courses and the project order, and whether staying on time would need a summer opening or a
 * college request. null until it answers, or if it cannot be reached; the
 * dashboard then uses the browser's own estimate (student-view.ts rankCurrentCourses).
 */
import * as React from "react"
import { apiFetch } from "@/lib/auth"
import type { GraduationDelays } from "@/lib/student-view"

export function useGraduationDelays(studentId: string): GraduationDelays | null {
  const [delays, setDelays] = React.useState<{ id: string; data: GraduationDelays } | null>(null)
  React.useEffect(() => {
    const c = new AbortController()
    apiFetch(`/api/students/${encodeURIComponent(studentId)}/graduation-delays`, { signal: c.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: GraduationDelays | null) => data?.delays && setDelays({ id: studentId, data: { delays: data.delays, needs_request: data.needs_request ?? {} } }))
      .catch(() => {})
    return () => c.abort()
  }, [studentId])
  return delays?.id === studentId ? delays.data : null
}
