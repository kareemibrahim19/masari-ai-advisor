"use client"

/**
 * Instructor recommendations from how students did with each instructor over the last 10 years, from the Masari AI
 * service (ai/chatbot/tools/instructors.py, the same model as the chat's recommend_instructor tool):
 *   GET /api/instructors/recommendations?student_id   { gpa_band, courses: [{ code, name_ar, name_en, course_mean,
 *                                                      instructors: [...this term's, usually one], history: [...] }] }
 *
 * The page joins it with each course's priority in the graduation plan (student-view.ts rankCurrentCourses), the
 * same priority the dashboard shows.
 */
import * as React from "react"
import { apiFetch } from "@/lib/auth"
import type { L } from "@/lib/i18n"

export type GradingStyle = "lenient" | "balanced" | "strict"

/** One academic year of the course with one instructor who taught it (for the chart). */
export type CourseYear = { year: string; instructorId: string; name: L; mean: number; passRate: number; students: number }

export type RankedInstructor = {
  id: string
  name: L
  /** First term teaching this course: no grade record of their own in it yet (no numbers below). */
  firstTime: boolean
  style: GradingStyle | null
  styleLabel: L | null
  /** What students in the student's GPA band got with this instructor (all students for a first-year student). */
  expected: number | null
  yearsTaught: number
  mean: number
  passRate: number
  aRate: number
  /** Average coursework, in marks out of `courseworkMax` (the coursework part of the 100). */
  coursework: number
  courseworkMax: number
  students: number
  reasons: L[]
  rank: number
  best: boolean
}

export type InstructorCourse = { code: string; name: L; courseMean: number | null; instructors: RankedInstructor[]; history: CourseYear[] }

export type InstructorRecommendations = { courses: InstructorCourse[]; band: string | null; status: "loading" | "ready" | "error" }

type ApiYear = { academic_year: string; instructor_id: string; name_ar: string; name_en: string; mean: number; pass_rate: number; students: number }

type ApiInstructor = {
  instructor_id: string
  name_ar: string
  name_en: string
  first_time: boolean
  style: GradingStyle | null
  style_ar: string | null
  style_en: string | null
  expected_total: number | null
  years?: number
  mean?: number
  pass_rate?: number
  a_rate?: number
  coursework_avg?: number
  coursework_max?: number
  students?: number
  reasons: string[]
  reasons_en: string[]
  rank: number
  best: boolean
}

type ApiCourse = { code: string; name_ar: string; name_en: string; course_mean: number | null; instructors: ApiInstructor[]; history: ApiYear[] }

const toInstructor = (x: ApiInstructor): RankedInstructor => ({
  id: x.instructor_id,
  name: { ar: x.name_ar, en: x.name_en },
  firstTime: x.first_time,
  style: x.style,
  styleLabel: x.style_ar && x.style_en ? { ar: x.style_ar, en: x.style_en } : null,
  expected: x.expected_total,
  yearsTaught: x.years ?? 0,
  mean: x.mean ?? 0,
  passRate: x.pass_rate ?? 0,
  aRate: x.a_rate ?? 0,
  coursework: x.coursework_avg ?? 0,
  courseworkMax: x.coursework_max ?? 0,
  students: x.students ?? 0,
  reasons: x.reasons.map((ar, i) => ({ ar, en: x.reasons_en[i] ?? ar })),
  rank: x.rank,
  best: x.best,
})

const toYear = (y: ApiYear): CourseYear => ({
  year: y.academic_year,
  instructorId: y.instructor_id,
  name: { ar: y.name_ar, en: y.name_en },
  mean: y.mean,
  passRate: y.pass_rate,
  students: y.students,
})

export function useInstructorRecommendations(studentId: string): InstructorRecommendations {
  const [state, setState] = React.useState<InstructorRecommendations & { id: string }>({ courses: [], band: null, status: "loading", id: "" })
  React.useEffect(() => {
    const c = new AbortController()
    apiFetch(`/api/instructors/recommendations?${new URLSearchParams({ student_id: studentId })}`, { signal: c.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setState({
          id: studentId,
          status: "ready",
          band: data.gpa_band ?? null,
          courses: ((data.courses ?? []) as ApiCourse[]).map((x) => ({
            code: x.code,
            name: { ar: x.name_ar, en: x.name_en },
            courseMean: x.course_mean,
            instructors: x.instructors.map(toInstructor),
            history: (x.history ?? []).map(toYear),
          })),
        })
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setState({ id: studentId, status: "error", band: null, courses: [] })
      })
    return () => c.abort()
  }, [studentId])
  return state.id === studentId ? state : { courses: [], band: null, status: "loading" }
}
