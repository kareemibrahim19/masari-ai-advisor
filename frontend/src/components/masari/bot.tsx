"use client"

/**
 * Masari, the bot (design "Masari Bot Animations"): a thin React wrapper around the <masari-bot> web component in
 * public/masari-bot.js, which draws and animates it (its moods, poke, wake, walk). The wrapper:
 *   - loads the script once, and sets every attribute itself (the element's `mood` is a read-only property, so React
 *     must not assign it);
 *   - follows the site's light/dark theme (dark = a white outline so the charcoal body stays visible);
 *   - goes back to the page's mood after waking up (the bot wakes into a wave first);
 *   - makes it dizzy after 5 quick clicks.
 */
import * as React from "react"
import { cn } from "@/lib/utils"

export type BotMood =
  | "idle" | "hop" | "wave" | "happy" | "thinking" | "talking" | "celebrate" | "sleep" | "sad" | "worried" | "proud"
  | "listening" | "reading" | "walk" | "peek" | "bye" | "confused" | "point" | "pointUp" | "nod" | "toss"

/** The element's own methods and the fields the wrapper touches (see public/masari-bot.js). */
export type BotElement = HTMLElement & {
  readonly mood: BotMood
  setMood(m: BotMood): void
  poke(): void
  wake(): void
  enter(): void
  walkAlong(points: [number, number][], msPerStep?: number): void
  /** Like walkAlong, but hops from point to point. */
  hopAlong(points: [number, number][], msPerHop?: number): void
  /** Yawns, nods off, then sleeps (fires masari-asleep). */
  doze(): void
  resetWalk(): void
  walkPos: [number, number]
  lastAct: number
  /** How far the body is sunk below the edge in "peek" (240 = out of sight). */
  pk: number
}

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "masari-bot": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}

let loading: Promise<void> | null = null
/** Adds public/masari-bot.js once and resolves when <masari-bot> is defined. */
export function loadBot(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  if (customElements.get("masari-bot")) return Promise.resolve()
  loading ??= new Promise<void>((resolve) => {
    const s = document.createElement("script")
    s.src = "/masari-bot.js?v=4" // bump when the file changes, so browsers drop the cached copy
    s.async = true
    document.head.appendChild(s)
    customElements.whenDefined("masari-bot").then(() => resolve())
  })
  return loading
}

/** true while <html> has the .dark class (the theme switch in the header). */
function useDarkClass() {
  return React.useSyncExternalStore(
    (cb) => {
      const mo = new MutationObserver(cb)
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
      return () => mo.disconnect()
    },
    () => document.documentElement.classList.contains("dark"),
    () => false
  )
}

let graduate = false
const gradListeners = new Set<() => void>()

/** Dresses every bot in the graduation cap and gown while a student in their last semester is signed in (the hello
 *  and goodbye screens, the path, the chat, the plan). Signed out, the login page shows the plain bot. */
export function setGraduateBot(on: boolean) {
  if (graduate === on) return
  graduate = on
  gradListeners.forEach((l) => l())
}

function useGraduateBot() {
  return React.useSyncExternalStore(
    (cb) => {
      gradListeners.add(cb)
      return () => gradListeners.delete(cb)
    },
    () => graduate,
    () => false
  )
}

type Props = {
  mood: BotMood
  outfit?: "none" | "grad" | "chat"
  /** Pops in when it first appears. */
  enter?: boolean
  /** Seconds without activity before it falls asleep (the chat). */
  sleepAfter?: number
  /** Mood when a walk ends (default: wave). */
  arrive?: BotMood
  edge?: "bottom" | "left" | "right"
  /** With mood "bye": plays once, then fires masari-gone. */
  once?: boolean
  /** Eyes follow the pointer (default true). */
  track?: boolean
  className?: string
  style?: React.CSSProperties
  /** What a screen reader hears; without it the bot is decoration. */
  label?: string
}

export const Bot = React.forwardRef<BotElement | null, Props>(function Bot(
  { mood, outfit = "none", enter, sleepAfter, arrive, edge, once, track = true, className, style, label },
  ref
) {
  const el = React.useRef<BotElement | null>(null)
  const dark = useDarkClass()
  // A graduating student's bot wears the graduation outfit everywhere, whatever the page asks for.
  const look = useGraduateBot() ? "grad" : outfit
  const [ready, setReady] = React.useState(false)
  const [dizzy, setDizzy] = React.useState(false)
  const moodRef = React.useRef(mood)
  React.useImperativeHandle(ref, () => el.current as BotElement)

  React.useEffect(() => {
    let live = true
    loadBot().then(() => live && setReady(true))
    return () => {
      live = false
    }
  }, [])

  // Attributes, set by hand (see the note at the top).
  React.useLayoutEffect(() => {
    const b = el.current
    if (!b) return
    const set = (k: string, v: string | number | boolean | undefined) =>
      v === undefined || v === false ? b.removeAttribute(k) : b.setAttribute(k, v === true ? "" : String(v))
    set("theme", dark ? "dark" : "light")
    set("outfit", look)
    set("sleep-after", sleepAfter)
    set("arrive", arrive)
    set("edge", edge)
    set("once", once)
    set("track", track ? undefined : "false")
    set("wake-to", "wave")
  }, [dark, look, sleepAfter, arrive, edge, once, track])

  const peeked = React.useRef(false)
  React.useLayoutEffect(() => {
    moodRef.current = mood
    const b = el.current
    if (!b || dizzy) return
    b.setAttribute("mood", mood)
    // The element only starts a peek from below the edge if the mood is set when it connects, which is before
    // this runs: start it there by hand, once.
    if (mood === "peek" && !peeked.current && typeof b.poke === "function") {
      peeked.current = true
      b.pk = 240
    }
  }, [mood, dizzy, ready])

  // The element reads `enter` when it connects, which can be before this runs: then ask it directly.
  React.useLayoutEffect(() => {
    const b = el.current
    if (!enter || !b) return
    b.setAttribute("enter", "")
    if (typeof b.enter === "function") b.enter()
  }, [enter, ready])

  // After waking (into a wave), back to whatever the page wants. Five clicks within 2.5 s: dizzy for a moment.
  React.useEffect(() => {
    const b = el.current
    if (!b) return
    let back: ReturnType<typeof setTimeout>
    let pokes: number[] = []
    const onAwake = () => {
      clearTimeout(back)
      back = setTimeout(() => b.setAttribute("mood", moodRef.current), 2600)
    }
    const onPoke = () => {
      const now = performance.now()
      pokes = [...pokes.filter((p) => now - p < 2500), now]
      if (pokes.length >= 5) {
        pokes = []
        setDizzy(true)
        b.setAttribute("mood", "confused")
        clearTimeout(back)
        back = setTimeout(() => setDizzy(false), 2200)
      }
    }
    b.addEventListener("masari-awake", onAwake)
    b.addEventListener("masari-poke", onPoke)
    return () => {
      clearTimeout(back)
      b.removeEventListener("masari-awake", onAwake)
      b.removeEventListener("masari-poke", onPoke)
    }
  }, [ready])

  return (
    <masari-bot
      ref={(n: HTMLElement | null) => {
        el.current = n as BotElement | null
      }}
      className={cn("masari-bot", dizzy && "masari-bot-dizzy", className)}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
})
