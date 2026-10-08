"use client"

/**
 * Interactive demo state that must survive switching pages:
 * selected courses, the open recommendations tab, instructor preferences, the what-if scenario and the chat.
 * Nothing is saved to a server; a full page refresh resets it.
 */
import * as React from "react"
import { defaultPrefs, proposedNow, type StudentPrefs } from "@/lib/mock-data"
import type { L } from "@/lib/i18n"

export type RecTab = "courses" | "instructors"

export type ChatMessage =
  | { id: string; role: "user"; text: string | L }
  | { id: string; role: "assistant"; kind: "recommendation" | "prereq" | "demo" }

const seedMessages: ChatMessage[] = [
  {
    id: "m1",
    role: "user",
    text: {
      ar: "أسجل إيه الترم الجاي، ومين الدكاترة المناسبين ليا؟",
      en: "What should I register for next semester, and which instructors suit me?",
    },
  },
  { id: "m2", role: "assistant", kind: "recommendation" },
  { id: "m3", role: "user", text: { ar: "طب ليه مش قادر أسجل Deep Learning؟", en: "And why can't I register for Deep Learning?" } },
  { id: "m4", role: "assistant", kind: "prereq" },
]

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
  listening: boolean
  sendMessage: (text: string) => void
  toggleListening: () => void
  newChat: () => void
}

const DemoStateContext = React.createContext<DemoState | null>(null)

export function DemoStateProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = React.useState<string[]>(proposedNow)
  const [recTab, setRecTab] = React.useState<RecTab>("courses")
  const [insCourse, setInsCourse] = React.useState("ECE 321")
  const [prefs, setPrefs] = React.useState<StudentPrefs>(defaultPrefs)
  const [scenarioId, setScenarioId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<ChatMessage[]>(seedMessages)
  const [thinking, setThinking] = React.useState(false)
  const [listening, setListening] = React.useState(false)
  const replyTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined)

  const toggleCourse = React.useCallback((code: string) => {
    setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]))
  }, [])

  const sendMessage = React.useCallback(
    (text: string) => {
      const value = text.trim()
      if (!value || thinking) return
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: value }])
      setThinking(true)
      // UI-only: the real reply will stream from the backend.
      replyTimer.current = setTimeout(() => {
        setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", kind: "demo" }])
        setThinking(false)
      }, 900)
    },
    [thinking]
  )

  const newChat = React.useCallback(() => {
    clearTimeout(replyTimer.current)
    setMessages([])
    setThinking(false)
    setListening(false)
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
      listening,
      sendMessage,
      toggleListening: () => setListening((l) => !l),
      newChat,
    }),
    [selected, toggleCourse, recTab, insCourse, prefs, scenarioId, messages, thinking, listening, sendMessage, newChat]
  )

  return <DemoStateContext.Provider value={value}>{children}</DemoStateContext.Provider>
}

export function useDemoState() {
  const ctx = React.useContext(DemoStateContext)
  if (!ctx) throw new Error("useDemoState must be used inside <DemoStateProvider>")
  return ctx
}
