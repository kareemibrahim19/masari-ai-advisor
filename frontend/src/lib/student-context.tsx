"use client"

/**
 * The signed-in student. The login page calls signIn(studentId, password), which signs in on the server
 * (lib/auth.ts); every other page reads the student's computed view with useStudentView(). The token and id
 * are kept in sessionStorage, so a refresh stays signed in (closing the tab signs out). When the server
 * rejects the token (401 on any request), the student is signed out and the app shell opens /login.
 */
import * as React from "react"
import { clearSession, login, savedStudentId, SIGNED_OUT_EVENT, type LoginResult } from "@/lib/auth"
import { getStudent } from "@/lib/data/student-source"
import { fetchSections } from "@/lib/data/sections-source"
import type { StudentFileEntry } from "@/lib/data/types"
import { sectionsFor, type Section } from "@/lib/demo-content"
import { buildStudentView, type StudentView } from "@/lib/student-view"

type StudentContextValue = {
  /** false until the saved session has been checked (avoids flashing the login page on refresh). */
  ready: boolean
  view: StudentView | null
  signIn: (studentId: string, password: string) => Promise<LoginResult>
  signOut: () => void
}

const StudentContext = React.createContext<StudentContextValue | null>(null)

export function StudentProvider({ children }: { children: React.ReactNode }) {
  const [entry, setEntry] = React.useState<StudentFileEntry | null>(null)
  const [ready, setReady] = React.useState(false)
  // Seats per section from the AI service; the simulated ones until it answers (or if it cannot be reached).
  const [sections, setSections] = React.useState<Record<string, Section[]>>(sectionsFor)

  React.useEffect(() => {
    const c = new AbortController()
    fetchSections(c.signal)
      .then(setSections)
      .catch(() => {})
    return () => c.abort()
  }, [])

  React.useEffect(() => {
    // A saved sign-in that has not expired: load the student with its token.
    const saved = savedStudentId()
    Promise.resolve(saved ? getStudent(saved) : null).then((s) => {
      if (!s) clearSession()
      setEntry(s)
      setReady(true)
    })
    // The server rejected the token (expired, or signed out elsewhere): back to the login page.
    const onSignedOut = () => setEntry(null)
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut)
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut)
  }, [])

  const signIn = React.useCallback(async (studentId: string, password: string) => {
    const result = await login(studentId, password)
    if (result.ok) setEntry(result.student)
    return result
  }, [])

  const signOut = React.useCallback(() => {
    clearSession()
    setEntry(null)
  }, [])

  const view = React.useMemo(() => (entry ? buildStudentView(entry, sections) : null), [entry, sections])
  const value = React.useMemo(() => ({ ready, view, signIn, signOut }), [ready, view, signIn, signOut])

  return <StudentContext.Provider value={value}>{children}</StudentContext.Provider>
}

export function useStudent() {
  const ctx = React.useContext(StudentContext)
  if (!ctx) throw new Error("useStudent must be used inside <StudentProvider>")
  return ctx
}

/** The signed-in student's data. Only used on pages behind the login (the app shell guarantees a student). */
export function useStudentView(): StudentView {
  const { view } = useStudent()
  if (!view) throw new Error("useStudentView needs a signed-in student")
  return view
}
