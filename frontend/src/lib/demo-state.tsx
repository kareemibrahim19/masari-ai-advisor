"use client"

/**
 * Interactive demo state that must survive switching pages:
 * selected courses, the open recommendations tab, instructor preferences, the what-if scenario and the chat.
 * Nothing is saved to a server; a full page refresh resets it. New chat questions go to the Masari AI service.
 */
import * as React from "react"
import { MASARI_API_URL } from "@/lib/api-url"
import { defaultPrefs, instructors, type StudentPrefs } from "@/lib/demo-content"
import type { L } from "@/lib/i18n"
import { usePlanChoice } from "@/lib/plan-api"
import { chatTitle, loadChats, saveChats, upsertChat, type SavedChat } from "@/lib/chat-history"
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
  // A case only a real academic advisor can settle: the email the student can send them (shown as a button).
  | { type: "advisor_email"; to: string; subject: string; body: string }

/** A document the RAG service searched to write its answer. */
export type RagSource = { id: string; title: string; source: string }

/** The ready email to the student's academic advisor, attached to the answer that wrote it. */
export type AdvisorEmail = { to: string; subject: string; body: string }

export type ChatMessage =
  | { id: string; role: "user"; text: string | L }
  | { id: string; role: "assistant"; kind: "ai"; text: string; sources: RagSource[]; advisorEmail?: AdvisorEmail }
  | { id: string; role: "assistant"; kind: "error"; detail: string }

export { MASARI_API_URL }

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
  /** Recent chats of this student (newest first), saved in this browser. */
  chats: SavedChat[]
  /** The open chat's id, or null for a new chat that has no message yet. */
  chatId: string | null
  openChat: (id: string) => void
  deleteChat: (id: string) => void
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
  const studentId = view.student.id
  const [chats, setChats] = React.useState<SavedChat[]>(() => loadChats(studentId))
  const [chatId, setChatId] = React.useState<string | null>(null)
  // Refs so a reply that arrives later is added to the chat it belongs to.
  const messagesRef = React.useRef<ChatMessage[]>([])
  const chatIdRef = React.useRef<string | null>(null)

  /** Shows `next` and saves it as the open chat (a new chat gets its id with its first message). */
  const commit = React.useCallback(
    (next: ChatMessage[]) => {
      messagesRef.current = next
      setMessages(next)
      if (!next.length) return
      const id = chatIdRef.current ?? (chatIdRef.current = crypto.randomUUID())
      setChatId(id)
      setChats((list) => {
        const out = upsertChat(list, { id, title: chatTitle(next), updatedAt: Date.now(), messages: next })
        saveChats(studentId, out)
        return out
      })
    },
    [studentId]
  )
  const [thinking, setThinking] = React.useState(false)
  const [planChoice] = usePlanChoice(view.student.id)
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
      const history = toHistory(messagesRef.current)
      commit([...messagesRef.current, { id: crypto.randomUUID(), role: "user", text: value }])
      setThinking(true)

      const controller = new AbortController()
      pending.current = controller
      const reply = (msg: ChatMessage) => {
        if (controller.signal.aborted) return // another chat was opened while waiting
        commit([...messagesRef.current, msg])
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
          // the graduation plan page's target, so "can I graduate in 4 years?" gets the page's answer
          plan_target: planChoice.target,
          plan_summer: planChoice.summer,
        }),
        signal: controller.signal,
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
          if (!controller.signal.aborted && Array.isArray(data.actions)) applyActions(data.actions as ChatAction[])
          // The email comes from the tool's result, not the model's text, so the button always has all of it.
          const email = Array.isArray(data.actions)
            ? (data.actions as ChatAction[]).find((a) => a.type === "advisor_email")
            : undefined
          reply({
            id: crypto.randomUUID(),
            role: "assistant",
            kind: "ai",
            text: data.answer ?? "",
            sources: data.sources ?? [],
            ...(email ? { advisorEmail: { to: email.to, subject: email.subject, body: email.body } } : {}),
          })
        })
        .catch((e: Error) => {
          if (e.name === "AbortError") return
          reply({ id: crypto.randomUUID(), role: "assistant", kind: "error", detail: e.message })
        })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [thinking, commit, view.student.id, view.student.maxLoad, view.recommendedCourses, excluded, prefs, selected, applyActions, planChoice]
  )

  const newChat = React.useCallback(() => {
    pending.current?.abort()
    chatIdRef.current = null
    setChatId(null)
    messagesRef.current = []
    setMessages([])
    setThinking(false)
  }, [])

  const openChat = React.useCallback(
    (id: string) => {
      const chat = chats.find((c) => c.id === id)
      if (!chat) return
      pending.current?.abort()
      chatIdRef.current = id
      setChatId(id)
      messagesRef.current = chat.messages
      setMessages(chat.messages)
      setThinking(false)
    },
    [chats]
  )

  const deleteChat = React.useCallback(
    (id: string) => {
      setChats((list) => {
        const out = list.filter((c) => c.id !== id)
        saveChats(studentId, out)
        return out
      })
      if (chatIdRef.current === id) newChat()
    },
    [studentId, newChat]
  )

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
      chats,
      chatId,
      openChat,
      deleteChat,
    }),
    [selected, toggleCourse, recTab, insCourse, prefs, excluded, restoreInstructor, scenarioId, messages, thinking, sendMessage, newChat, chats, chatId, openChat, deleteChat]
  )

  return <DemoStateContext.Provider value={value}>{children}</DemoStateContext.Provider>
}

export function useDemoState() {
  const ctx = React.useContext(DemoStateContext)
  if (!ctx) throw new Error("useDemoState must be used inside <DemoStateProvider>")
  return ctx
}
