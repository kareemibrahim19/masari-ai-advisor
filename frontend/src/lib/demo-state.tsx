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
  const [scenarioId, setScenarioId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [thinking, setThinking] = React.useState(false)
  const pending = React.useRef<AbortController>(undefined)
  const studentId = view.student.id

  const toggleCourse = React.useCallback((code: string) => {
    setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]))
  }, [])

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
        // student_id lets the service answer with the student's own record (credit limit, standing, plan…).
        body: JSON.stringify({ question: value, history, student_id: studentId }),
        signal: controller.signal,
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
          reply({ id: crypto.randomUUID(), role: "assistant", kind: "ai", text: data.answer ?? "", sources: data.sources ?? [] })
        })
        .catch((e: Error) => {
          if (e.name === "AbortError") return
          reply({ id: crypto.randomUUID(), role: "assistant", kind: "error", detail: e.message })
        })
    },
    [messages, thinking, studentId]
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
      scenarioId,
      setScenarioId,
      messages,
      thinking,
      sendMessage,
      newChat,
    }),
    [selected, toggleCourse, recTab, insCourse, prefs, scenarioId, messages, thinking, sendMessage, newChat]
  )

  return <DemoStateContext.Provider value={value}>{children}</DemoStateContext.Provider>
}

export function useDemoState() {
  const ctx = React.useContext(DemoStateContext)
  if (!ctx) throw new Error("useDemoState must be used inside <DemoStateProvider>")
  return ctx
}
