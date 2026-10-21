"use client"

/**
 * The student's academic advisor, from the Masari AI service (GET /api/students/{id}/advisor, ai/chatbot/server.py).
 * null while loading, when the student has none on file, or when the service cannot be reached: the email to the
 * advisor then leaves the address for the student to fill in.
 */
import * as React from "react"
import { apiFetch } from "@/lib/auth"

export type Advisor = {
  name_ar: string
  name_en: string
  title_ar?: string | null
  email: string
  office_ar?: string | null
  office_hours_ar?: string | null
}

export function useAdvisor(studentId: string): Advisor | null {
  const [advisor, setAdvisor] = React.useState<Advisor | null>(null)
  React.useEffect(() => {
    const c = new AbortController()
    apiFetch(`/api/students/${encodeURIComponent(studentId)}/advisor`, { signal: c.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then(setAdvisor)
      .catch(() => {}) // unreachable: no advisor shown
    return () => c.abort()
  }, [studentId])
  return advisor
}
