"use client"

/**
 * Full-screen moments with Masari, the bot:
 *   - Hello, right after signing in: the login page is gone, the screen is just Masari, big, waving (celebrating on
 *     the very first sign-in) with "Hi, <name>". Then it fades away onto the dashboard, and only then does the bot on
 *     the path start walking (useSplashDone).
 *   - Goodbye, on signing out: the same screen, Masari waves, turns and walks off the edge, then the login page opens.
 * The login page leaves a note in sessionStorage (greetOnDashboard) so the hello shows once per sign-in.
 */
import * as React from "react"
import { Bot, type BotElement, type BotMood } from "@/components/masari/bot"
import { useI18n } from "@/lib/i18n"
import { useStudentView } from "@/lib/student-context"
import { cn } from "@/lib/utils"

type Greet = "login" | "activated"
const KEY = "masari.greet"
const HELLO_MS = 2800 // on screen, then it fades out
const FADE_MS = 450
const WAVE_BYE_MS = 1300 // waves goodbye, then walks off
const WALK_OFF_MS = 1700

/** Called by the login page: what kind of hello the app should give after sign-in (null: none). */
export function greetOnDashboard(kind: Greet | null) {
  try {
    if (kind) sessionStorage.setItem(KEY, kind)
    else sessionStorage.removeItem(KEY)
  } catch {}
  notify()
}

// ---- "is the hello still on screen?" for the rest of the app (the bot on the path waits for it) ----
let showing = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
const pending = () => {
  try {
    return showing || sessionStorage.getItem(KEY) !== null
  } catch {
    return showing
  }
}
/** true once there is no hello waiting or on screen. */
export function useSplashDone() {
  return !React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    pending,
    () => false
  )
}

/** The screen itself: nothing but Masari and one line. */
function Splash({
  mood,
  line,
  fading = false,
  lineGone = false,
  botRef,
}: {
  mood: BotMood
  line: string
  /** The whole screen fades away. */
  fading?: boolean
  /** Only the words go (the bot is walking off). */
  lineGone?: boolean
  botRef?: React.Ref<BotElement | null>
}) {
  return (
    <div className={cn("masari-splash", fading && "masari-splash-out")} role="status" aria-live="polite">
      <Bot ref={botRef} mood={mood} enter className="masari-splash-bot" />
      <p className={cn("masari-splash-line", lineGone && "masari-splash-out")}>{line}</p>
    </div>
  )
}

/** Mounted once in the app shell: shows the hello when the login page left the note. */
export function WelcomeSplash() {
  const { t, tr } = useI18n()
  const { student } = useStudentView()
  const [greet, setGreet] = React.useState<Greet | null>(null)
  const [fading, setFading] = React.useState(false)

  React.useEffect(() => {
    let kind: string | null = null
    try {
      kind = sessionStorage.getItem(KEY)
    } catch {}
    if (kind !== "login" && kind !== "activated") return
    showing = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable after mount
    setGreet(kind)
    // The note is removed a tick later, so React's dev double-run of effects still finds it.
    setTimeout(() => greetOnDashboard(null), 0)
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const stay = still ? 1200 : HELLO_MS
    const fade = setTimeout(() => setFading(true), stay)
    const end = setTimeout(() => {
      showing = false
      setGreet(null)
      notify()
    }, stay + FADE_MS)
    return () => {
      clearTimeout(fade)
      clearTimeout(end)
    }
  }, [])

  if (!greet) return null
  return (
    <Splash
      mood={greet === "activated" ? "celebrate" : "wave"}
      line={t("splashHello").replace("{name}", tr(student.name))}
      fading={fading}
    />
  )
}

/** Signing out: Masari waves, then walks off the inline end of the screen; `onGone` opens the login page. */
export function GoodbyeSplash({ onGone }: { onGone: () => void }) {
  const { t, tr, dir } = useI18n()
  const { student } = useStudentView()
  const bot = React.useRef<BotElement | null>(null)
  const [walking, setWalking] = React.useState(false)
  const gone = React.useRef(onGone)
  React.useEffect(() => {
    gone.current = onGone
  }, [onGone])

  React.useEffect(() => {
    const walk = setTimeout(() => {
      const b = bot.current
      if (!b || typeof b.walkAlong !== "function") return gone.current()
      setWalking(true)
      // Far enough to leave the screen whatever its size; the end of the page is left in Arabic, right in English.
      const off = (window.innerWidth / 2 + b.getBoundingClientRect().width) * (dir === "rtl" ? -1 : 1)
      b.walkAlong([[off, 0]], WALK_OFF_MS)
    }, WAVE_BYE_MS)
    const out = setTimeout(() => gone.current(), WAVE_BYE_MS + WALK_OFF_MS + 300)
    return () => {
      clearTimeout(walk)
      clearTimeout(out)
    }
  }, [dir])

  return <Splash botRef={bot} mood={walking ? "walk" : "wave"} line={t("splashBye").replace("{name}", tr(student.name))} lineGone={walking} />
}
