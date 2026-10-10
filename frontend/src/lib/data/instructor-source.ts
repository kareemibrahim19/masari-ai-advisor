"use client"

/**
 * Instructor recommendations come from the Masari AI service (the same `recommend_instructor` tool the chat
 * uses), so the page and the chat always show the same numbers:
 *   GET /api/instructors/courses                          courses that have instructor survey data
 *   GET /api/instructors/recommend?course_code&student_id (+ pace, workload, practical when the student set them)
 *
 * If the service is unreachable the pages fall back to the simulated instructors in demo-content.ts, so the
 * demo never shows an empty screen (`source` tells which one is on screen).
 */
import * as React from "react"
import { MASARI_API_URL } from "@/lib/demo-state"
import {
  confidenceFromResponses,
  defaultPrefs,
  demoCompatibility,
  instructors as demoInstructors,
  type StudentPrefs,
  type TeachingProfile,
} from "@/lib/demo-content"
import type { L } from "@/lib/i18n"

export type Basis = "surveys_only" | "surveys_and_preferences" | "surveys_and_performance"

export const basisText: Record<Basis, L> = {
  surveys_only: { ar: "مبني على تقييمات الطلبة السابقين", en: "Based on past student evaluations" },
  surveys_and_preferences: { ar: "مبني على تقييمات الطلبة وتفضيلاتك", en: "Based on student evaluations and your preferences" },
  surveys_and_performance: { ar: "مبني على تقييمات الطلبة وأدائك السابق", en: "Based on student evaluations and your past performance" },
}

export type RankedInstructor = {
  id: string
  name: L
  section: string
  responses: number
  profile: TeachingProfile
  score: number
  conf: "high" | "medium" | "low"
  /** Why this instructor fits (one entry per reason), bilingual. */
  reasons: L[]
}

export type Ranking = { basis: Basis; items: RankedInstructor[]; source: "api" | "demo" }

type ApiInstructor = {
  instructor_id: string
  name_ar: string
  name_en: string
  section: string
  responses: number
  confidence: "high" | "medium" | "low"
  profile: TeachingProfile
  score: number
  reasons: string[]
  reasons_en: string[]
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${MASARI_API_URL}${path}`, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const isDefault = (p: StudentPrefs) =>
  p.pace === defaultPrefs.pace && p.workload === defaultPrefs.workload && p.practical === defaultPrefs.practical

/** The simulated ranking from demo-content.ts, used only when the AI service cannot be reached. */
function demoRanking(course: string, prefs: StudentPrefs): Ranking {
  const items = demoInstructors
    .filter((i) => i.courseCode === course)
    .map((i) => ({
      id: i.id,
      name: i.name,
      section: i.section,
      responses: i.responses,
      profile: i.profile,
      score: demoCompatibility(i.profile, prefs),
      conf: confidenceFromResponses(i.responses),
      reasons: [i.aiSummary],
    }))
    .sort((a, b) => b.score - a.score)
  return { basis: "surveys_and_preferences", items, source: "demo" }
}

/** Courses that have instructor data: from the service, else the simulated ones. */
export function useInstructorCourses(): string[] {
  const fallback = React.useMemo(() => Array.from(new Set(demoInstructors.map((i) => i.courseCode))), [])
  const [codes, setCodes] = React.useState<string[]>(fallback)
  React.useEffect(() => {
    const c = new AbortController()
    getJson<{ courses: { code: string }[] }>("/api/instructors/courses", c.signal)
      .then((r) => r.courses.length && setCodes(r.courses.map((x) => x.code)))
      .catch(() => {})
    return () => c.abort()
  }, [])
  return codes
}

/**
 * The ranking of a course's instructors for the signed-in student. Preferences are sent only after the student
 * moves a slider; until then the service ranks by the student's own history (or the surveys alone).
 */
export function useInstructorRanking(studentId: string, course: string, prefs: StudentPrefs): Ranking & { loading: boolean } {
  const [state, setState] = React.useState<Ranking & { key: string }>({ basis: "surveys_only", items: [], source: "api", key: "" })
  const stated = !isDefault(prefs)
  const key = `${studentId}|${course}|${stated ? `${prefs.pace},${prefs.workload},${prefs.practical}` : "-"}`

  React.useEffect(() => {
    if (!course) return
    const c = new AbortController()
    const timer = setTimeout(() => {
      const q = new URLSearchParams({ course_code: course, student_id: studentId })
      if (stated) {
        q.set("pace", String(prefs.pace))
        q.set("workload", String(prefs.workload))
        q.set("practical", String(prefs.practical))
      }
      getJson<{ basis: Basis; ranking: ApiInstructor[] }>(`/api/instructors/recommend?${q}`, c.signal)
        .then((r) =>
          setState({
            key,
            basis: r.basis,
            source: "api",
            items: r.ranking.map((x) => ({
              id: x.instructor_id,
              name: { ar: x.name_ar, en: x.name_en },
              section: x.section,
              responses: x.responses,
              profile: x.profile,
              score: x.score,
              conf: x.confidence,
              reasons: x.reasons.map((ar, i) => ({ ar, en: x.reasons_en[i] ?? ar })),
            })),
          })
        )
        .catch((e: Error) => {
          if (e.name !== "AbortError") setState({ key, ...demoRanking(course, prefs) })
        })
    }, 250) // wait for the slider to stop moving
    return () => {
      clearTimeout(timer)
      c.abort()
    }
    // `key` stands for course, student and the preferences that were set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { ...state, loading: state.key !== key }
}
