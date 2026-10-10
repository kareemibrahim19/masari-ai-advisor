"use client"

/**
 * Interactive demo state that must survive switching pages:
 * selected courses, the open recommendations tab, instructor preferences, the what-if scenario and the chat.
 * Nothing is saved to a server; a full page refresh resets it. New chat questions go to the Masari AI service.
 */
import * as React from "react"
import { defaultPrefs, instructors, type StudentPrefs } from "@/lib/demo-content"
import type { L } from "@/lib/i18n"
import { useStudentView } from "@/lib/student-context"
import type { StudentView } from "@/lib/student-view"

export type RecTab = "courses" | "instructors"

/**
 * Something the chat asks the website to change on its pages, returned by the AI service next to the answer:
 * remove an instructor from the recommendations, bring one back, or move the preference sliders.
 */
export type ChatAction =
  | { type: "avoid_instructor"; key: string; instructor_id: string; name_ar: string; name_en: string; course_code: string | null }
  | { type: "restore_instructor"; key: string; instructor_id: string }
  | { type: "set_preferences"; preferences: Partial<StudentPrefs> }
  | { type: "select_course"; course_code: string }
  | { type: "unselect_course"; course_code: string }
  | { type: "set_selection"; courses: string[] }

/** A document the RAG service searched to write its answer. */
export type RagSource = { id: string; title: string; source: string }

export type ChatMessage =
  | { id: string; role: "user"; text: string | L }
  | { id: string; role: "assistant"; kind: "ai"; text: string; sources: RagSource[] }
  | { id: string; role: "assistant"; kind: "error"; detail: string }

/**
 * Masari AI service (ai/chatbot/server.py). Override with NEXT_PUBLIC_MASARI_API_URL.
 * Without it, production builds use the hosted service so every Vercel copy of the site has a working chat.
 */
export const MASARI_API_URL =
  process.env.NEXT_PUBLIC_MASARI_API_URL ??
  (process.env.NODE_ENV === "production" ? "https://masari-ai-pink.vercel.app" : "http://localhost:8000")

/** Turns the visible conversation into the history the AI service expects (real turns only, not the seeded demo). */
function toHistory(messages: ChatMessage[]) {
  return messages.flatMap((m) => {
    if (m.role === "user") return typeof m.text === "string" ? [{ role: "user", content: m.text }] : []
    return m.kind === "ai" ? [{ role: "assistant", content: m.text }] : []
  })
}

/** Instructor tab default: the first proposed course that has instructor data, else the first course with any. */
const defaultInstructorCourse = (view: StudentView) =>
  view.proposedNow.find((code) => instructors.some((i) => i.courseCode === code)) ?? instructors[0]?.courseCode ?? ""

type DemoState = {
  selected: string[]
  toggleCourse: (code: string) => void
  recTab: RecTab
  setRecTab: (tab: RecTab) => void
  insCourse: string
  setInsCourse: (code: string) => void
  prefs: StudentPrefs
  setPrefs: React.Dispatch<React.SetStateAction<StudentPrefs>>
  /** Instructors the student asked (in the chat) not to see: "i4" everywhere, "i4:CSE 315" in one course. */
  excluded: string[]
  restoreInstructor: (key: string) => void
  scenarioId: string | null
  setScenarioId: (id: string | null) => void
  messages: ChatMessage[]
  thinking: boolean
  sendMessage: (text: string) => void
  newChat: () => void
}

const DemoStateContext = React.createContext<DemoState | null>(null)

/** Mounted per signed-in student (keyed by student id in the app shell), so it starts fresh for each student. */
export function DemoStateProvider({ children }: { children: React.ReactNode }) {
  const view = useStudentView()
  const [selected, setSelected] = React.useState<string[]>(view.proposedNow)
  const [recTab, setRecTab] = React.useState<RecTab>("courses")
  const [insCourse, setInsCourse] = React.useState(() => defaultInstructorCourse(view))
  const [prefs, setPrefs] = React.useState<StudentPrefs>(defaultPrefs)
  const [excluded, setExcluded] = React.useState<string[]>([])
  const [scenarioId, setScenarioId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [thinking, setThinking] = React.useState(false)
  const pending = React.useRef<AbortController>(undefined)

  const toggleCourse = React.useCallback((code: string) => {
    setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]))
  }, [])

  // Preferences are sent only once the student has moved a slider (or asked for a style in the chat).
  const prefsTouched = prefs.pace !== defaultPrefs.pace || prefs.workload !== defaultPrefs.workload || prefs.practical !== defaultPrefs.practical

  const restoreInstructor = React.useCallback((key: string) => {
    setExcluded((list) => list.filter((k) => k !== key))
  }, [])

  /** Applies what the chat asked the pages to change. */
  const applyActions = React.useCallback(
    (actions: ChatAction[]) => {
    const offered = new Set(view.recommendedCourses.map((c) => c.code))
    for (const a of actions) {
      if (a.type === "avoid_instructor") setExcluded((list) => (list.includes(a.key) ? list : [...list, a.key]))
      else if (a.type === "restore_instructor")
        // "i4" also clears the per-course entries of that instructor
        setExcluded((list) => list.filter((k) => k !== a.key && k.split(":")[0] !== a.instructor_id))
      else if (a.type === "set_preferences") setPrefs((p) => ({ ...p, ...a.preferences }))
      // Courses: only ones this page offers (the service checked them against the same list).
      else if (a.type === "select_course" && offered.has(a.course_code))
        setSelected((s) => (s.includes(a.course_code) ? s : [...s, a.course_code]))
      else if (a.type === "unselect_course") setSelected((s) => s.filter((c) => c !== a.course_code))
      else if (a.type === "set_selection") setSelected(a.courses.filter((c) => offered.has(c)))
    }
    },
    [view.recommendedCourses]
  )

  const sendMessage = React.useCallback(
    (text: string) => {
      const value = text.trim()
      if (!value || thinking) return
      const history = toHistory(messages)
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: value }])
      setThinking(true)

      const controller = new AbortController()
      pending.current = controller
      const reply = (msg: ChatMessage) => {
        if (controller.signal.aborted) return // "New chat" was pressed while waiting
        setMessages((m) => [...m, msg])
        setThinking(false)
      }

      fetch(`${MASARI_API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // student_id lets the service run its tools (credit limit, standing, GPA, instructors...) on this student.
        // excluded_instructors / preferences tell it what the recommendations page currently shows, so the chat
        // never suggests someone the student removed.
        body: JSON.stringify({
          question: value,
          history,
          student_id: view.student.id,
          excluded_instructors: excluded,
          preferences: prefsTouched ? prefs : null,
          // the courses tab: what is chosen, what may be chosen (by priority) and the load limit
          selected_courses: selected,
          eligible_courses: view.recommendedCourses.map((c) => ({ code: c.code, credits: c.credits })),
          max_load: view.student.maxLoad,
        }),
        signal: controller.signal,
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
          if (!controller.signal.aborted && Array.isArray(data.actions)) applyActions(data.actions as ChatAction[])
          reply({ id: crypto.randomUUID(), role: "assistant", kind: "ai", text: data.answer ?? "", sources: data.sources ?? [] })
        })
        .catch((e: Error) => {
          if (e.name === "AbortError") return
          reply({ id: crypto.randomUUID(), role: "assistant", kind: "error", detail: e.message })
        })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, thinking, view.student.id, view.student.maxLoad, view.recommendedCourses, excluded, prefs, selected, applyActions]
  )

  const newChat = React.useCallback(() => {
    pending.current?.abort()
    setMessages([])
    setThinking(false)
  }, [])

  const value = React.useMemo<DemoState>(
    () => ({
      selected,
      toggleCourse,
      recTab,
      setRecTab,
      insCourse,
      setInsCourse,
      prefs,
      setPrefs,
      excluded,
      restoreInstructor,
      scenarioId,
      setScenarioId,
      messages,
      thinking,
      sendMessage,
      newChat,
    }),
    [selected, toggleCourse, recTab, insCourse, prefs, excluded, restoreInstructor, scenarioId, messages, thinking, sendMessage, newChat]
  )

  return <DemoStateContext.Provider value={value}>{children}</DemoStateContext.Provider>
}

export function useDemoState() {
  const ctx = React.useContext(DemoStateContext)
  if (!ctx) throw new Error("useDemoState must be used inside <DemoStateProvider>")
  return ctx
}
