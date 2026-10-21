"use client"

/**
 * "Request a seat" in a full section, saved per student on the Masari AI service (ai/chatbot/seats.py):
 *   GET  /api/students/{id}/seat-requests   the student's requests
 *   POST /api/students/{id}/seat-requests   { course_code, section }; asking again returns the same request
 */
import * as React from "react"
import { apiFetch } from "@/lib/auth"

type SeatRequest = { id: number; course_code: string; section: string; status: string }

const url = (studentId: string) => `/api/students/${encodeURIComponent(studentId)}/seat-requests`
const keyOf = (code: string, section: string) => `${code}|${section}`

export function useSeatRequests(studentId: string) {
  const [sent, setSent] = React.useState<Set<string>>(() => new Set())
  const [busy, setBusy] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState<string | null>(null)
  /** The student's requests have been read (or could not be): until then nothing is shown as sent or not. */
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    const c = new AbortController()
    apiFetch(url(studentId), { signal: c.signal })
      .then((res) => (res.ok ? res.json() : { requests: [] }))
      .then((r: { requests: SeatRequest[] }) => setSent(new Set(r.requests.map((x) => keyOf(x.course_code, x.section)))))
      .catch(() => {}) // service unreachable: no requests shown as sent
      .finally(() => !c.signal.aborted && setLoaded(true))
    return () => c.abort()
  }, [studentId])

  const request = React.useCallback(
    (code: string, section: string) => {
      const key = keyOf(code, section)
      setBusy(key)
      setFailed(null)
      apiFetch(url(studentId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course_code: code, section }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          setSent((s) => new Set(s).add(key))
        })
        .catch(() => setFailed(key))
        .finally(() => setBusy(null))
    },
    [studentId]
  )

  /** Several requests at once (the timetable page's one email to the advisor). Resolves to false if any failed. */
  const requestAll = React.useCallback(
    (items: { code: string; section: string }[]) =>
      Promise.all(
        items.map(({ code, section }) =>
          apiFetch(url(studentId), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ course_code: code, section }),
          })
            .then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
              setSent((s) => new Set(s).add(keyOf(code, section)))
              return true
            })
            .catch(() => false)
        )
      ).then((all) => all.every(Boolean)),
    [studentId]
  )

  const isSent = React.useCallback((code: string, section: string) => sent.has(keyOf(code, section)), [sent])
  const isBusy = (code: string, section: string) => busy === keyOf(code, section)
  const hasFailed = (code: string, section: string) => failed === keyOf(code, section)
  return { loaded, isSent, isBusy, hasFailed, request, requestAll }
}
