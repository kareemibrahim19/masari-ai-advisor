"use client"

/**
 * Teaching assistant (معيد) recommendations, from the Masari AI service (ai/chatbot/tools/assistants.py, the same
 * result the chat's teaching_assistants tool gives):
 *   GET /api/teaching-assistants?student_id   { courses: [{ code, name_ar, name_en, assistants: [...] }] }
 *
 * Only the student's registered courses (this term) that have more than one teaching assistant come back; an empty
 * list means "no recommendations for you". Masari does not rank the assistants: the page shows the facts and the
 * student chooses.
 */
import * as React from "react"
import { apiFetch } from "@/lib/auth"
import type { L } from "@/lib/i18n"

export type TeachingAssistant = {
  id: string
  name: L
  age: number
  appointedYear: number
  /** The period on the system this assistant teaches the section in (1 or 2). */
  period: number
  /** 1 = first time teaching this course. */
  timesTaught: number
}

export type AssistantCourse = { code: string; name: L; assistants: TeachingAssistant[] }

type ApiAssistant = {
  id: string
  name_ar: string
  name_en: string
  age: number
  appointed_year: number
  period: number
  times_taught: number
}

type ApiCourse = { code: string; name_ar: string; name_en: string; assistants: ApiAssistant[] }

export type AssistantsState = { courses: AssistantCourse[]; status: "loading" | "ready" | "error" }

export function useTeachingAssistants(studentId: string): AssistantsState {
  const [state, setState] = React.useState<AssistantsState & { id: string }>({ courses: [], status: "loading", id: "" })
  React.useEffect(() => {
    const c = new AbortController()
    apiFetch(`/api/teaching-assistants?${new URLSearchParams({ student_id: studentId })}`, { signal: c.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const courses = ((await res.json()).courses ?? []) as ApiCourse[]
        setState({
          id: studentId,
          status: "ready",
          courses: courses.map((x) => ({
            code: x.code,
            name: { ar: x.name_ar, en: x.name_en },
            assistants: x.assistants.map((a) => ({
              id: a.id,
              name: { ar: a.name_ar, en: a.name_en },
              age: a.age,
              appointedYear: a.appointed_year,
              period: a.period,
              timesTaught: a.times_taught,
            })),
          })),
        })
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setState({ id: studentId, status: "error", courses: [] })
      })
    return () => c.abort()
  }, [studentId])
  return state.id === studentId ? state : { courses: [], status: "loading" }
}
