"use client"

/**
 * The signed-in student. The login page calls signIn(code); every other page reads the student's
 * computed view with useStudentView(). The id is kept in sessionStorage so a refresh stays signed in
 * (closing the tab signs out). Data comes from lib/data/student-source.ts.
 */
import * as React from "react"
import { findStudentByAccessCode, getStudent } from "@/lib/data/student-source"
import type { StudentFileEntry } from "@/lib/data/types"
import { buildStudentView, type StudentView } from "@/lib/student-view"

const KEY = "masari.studentId"

type StudentContextValue = {
  /** false until the saved session has been checked (avoids flashing the login page on refresh). */
  ready: boolean
  view: StudentView | null
  signIn: (code: string) => Promise<StudentFileEntry | null>
  signOut: () => void
}

const StudentContext = React.createContext<StudentContextValue | null>(null)

export function StudentProvider({ children }: { children: React.ReactNode }) {
  const [entry, setEntry] = React.useState<StudentFileEntry | null>(null)
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    let saved: string | null = null
    try {
      saved = sessionStorage.getItem(KEY)
    } catch {}
    // Same path with or without a saved id, so state is only set from the async result.
    Promise.resolve(saved ? getStudent(saved) : null).then((s) => {
      setEntry(s)
      setReady(true)
    })
  }, [])

  const signIn = React.useCallback(async (code: string) => {
    const s = await findStudentByAccessCode(code)
    if (s) {
      try {
        sessionStorage.setItem(KEY, s.student_id)
      } catch {}
      setEntry(s)
    }
    return s
  }, [])

  const signOut = React.useCallback(() => {
    try {
      sessionStorage.removeItem(KEY)
    } catch {}
    setEntry(null)
  }, [])

  const view = React.useMemo(() => (entry ? buildStudentView(entry) : null), [entry])
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
