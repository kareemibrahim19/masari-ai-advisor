"use client"

/**
 * The welcome right after signing in: on the dashboard, Masari pops in at the bottom corner and waves (or celebrates,
 * on the very first sign-in), with a line built from the student's own record. Once per sign-in: the login page
 * leaves a note in sessionStorage and the dashboard takes it. After a few seconds it calms down, then leaves.
 */
import * as React from "react"
import { X } from "lucide-react"
import { Bot, useBotSetting, type BotMood } from "@/components/masari/bot"
import { useI18n } from "@/lib/i18n"
import { useStudentView } from "@/lib/student-context"

type Greet = "login" | "activated"
const KEY = "masari.greet"
const PEEK_MS = 1600 // first it peeks up from the bottom edge
const TALK_MS = 8000 // then it comes out and talks, then stands quietly
const STAY_MS = 11000 // then it leaves

/** Called by the login page: what kind of greeting the dashboard should give (null: none). */
export function greetOnDashboard(kind: Greet | null) {
  try {
    if (kind) sessionStorage.setItem(KEY, kind)
    else sessionStorage.removeItem(KEY)
  } catch {}
}

export function WelcomeBot() {
  const { t, tr, num } = useI18n()
  const { student } = useStudentView()
  const [setting] = useBotSetting()
  const [greet, setGreet] = React.useState<Greet | null>(null)
  const [phase, setPhase] = React.useState<"peek" | "talk" | "quiet" | "gone">("peek")

  // Take the note once. The removal waits a tick so React's dev double-run of effects still sees it.
  React.useEffect(() => {
    let kind: string | null = null
    try {
      kind = sessionStorage.getItem(KEY)
    } catch {}
    if (kind !== "login" && kind !== "activated") return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable after mount
    setGreet(kind)
    setTimeout(() => greetOnDashboard(null), 0)
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const talk = setTimeout(() => setPhase("talk"), still ? 0 : PEEK_MS)
    const quiet = setTimeout(() => setPhase("quiet"), TALK_MS)
    const gone = setTimeout(() => setPhase("gone"), STAY_MS)
    return () => {
      clearTimeout(talk)
      clearTimeout(quiet)
      clearTimeout(gone)
    }
  }, [])

  if (!greet || phase === "gone" || setting === "off") return null
  const mood: BotMood = phase === "peek" ? "peek" : phase === "quiet" ? "idle" : greet === "activated" ? "celebrate" : "wave"
  const name = tr(student.name)
  const line =
    greet === "activated"
      ? t("botActivated").replace("{name}", name)
      : t("botWelcome").replace("{name}", name).replace("{hours}", num(student.total - student.earned))

  return (
    <div className="pointer-events-none fixed end-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 flex items-end gap-1 md:end-6 lg:bottom-6">
      {phase === "talk" && (
        <div
          role="status"
          className="pointer-events-auto relative mb-14 max-w-[min(15rem,60vw)] rounded-2xl rounded-ee-sm border bg-card px-3.5 py-2.5 text-sm leading-relaxed shadow-lg md:mb-20"
          style={{ animation: "masari-pop .35s ease .3s both" }}
        >
          <button
            type="button"
            onClick={() => setPhase("gone")}
            className="absolute -top-2 -start-2 grid size-6 place-items-center rounded-full border bg-card text-muted-foreground hover:text-foreground"
            aria-label={t("botClose")}
          >
            <X className="size-3.5" aria-hidden />
          </button>
          {line}
        </div>
      )}
      <Bot mood={mood} className="pointer-events-auto w-20 md:w-28" />
    </div>
  )
}
