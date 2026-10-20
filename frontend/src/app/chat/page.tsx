"use client"

import * as React from "react"
import { Check, Copy, ExternalLink, History, Loader2, Mic, Plus, SendHorizontal, Square, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { AppIcon } from "@/components/masari/brand"
import { Bot, type BotElement, type BotMood } from "@/components/masari/bot"
import { AiBadge, RagSourceChip } from "@/components/masari/trust"
import { chatSuggestions } from "@/lib/demo-content"
import { MODEL_BUSY, RATE_LIMITED, useDemoState, type AdvisorEmail, type ChatMessage, type RagSource } from "@/lib/demo-state"
import { useI18n } from "@/lib/i18n"
import { useStudentView } from "@/lib/student-context"
import { useVoiceInput } from "@/lib/use-voice-input"
import { cn } from "@/lib/utils"

const READ_SWAP_MS = 2600 // waiting: thinking, then reading the regulations, then thinking again
const BORED_AFTER_MS = 30_000 // left alone: gets bored and moves about
const SLEEP_AFTER_MS = 60_000 // then goes home, dozes off and sleeps
const WALK_LEG_MS = 1600
const HOP_MS = 900
const HOME_MS = 800
/** What it does standing still when bored. */
const BORED_MOVES: BotMood[] = ["wave", "nod", "happy", "celebrate", "point", "thinking"]

export default function ChatPage() {
  const { t, tr, dir } = useI18n()
  // Chat history lives in the shared demo state, so it survives switching pages.
  const { messages, thinking, sendMessage } = useDemoState()
  const [draft, setDraft] = React.useState("")
  // Voice: the transcript lands in the composer so the student can check it before sending.
  const voice = useVoiceInput(React.useCallback((text: string) => setDraft((d) => (d.trim() ? `${d.trim()} ${text}` : text)), []))
  const listening = voice.state === "recording"
  const endRef = React.useRef<HTMLDivElement>(null)

  // Masari above the composer. Waiting for an answer it thinks, then reads the regulations, then thinks again;
  // the answer types itself out while it talks, and it stops talking when the text stops. An error confuses it.
  // Left alone for 30 seconds it gets bored: walks about, hops, waves, nods… a mix. At a minute it goes back,
  // yawns, nods off and falls asleep. Typing or a click wakes it up (a mouse move only ends the boredom).
  const bot = React.useRef<BotElement | null>(null)
  const [typingId, setTypingId] = React.useState<string | null>(null)
  const [confused, setConfused] = React.useState(false)
  // Only a reply that ends a wait counts, not a conversation loaded from history.
  const wasThinking = React.useRef(false)
  React.useEffect(() => {
    const ended = wasThinking.current && !thinking
    wasThinking.current = thinking
    const last = messages[messages.length - 1]
    if (!ended || last?.role !== "assistant") return
    if (last.kind === "ai") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to a reply that just arrived
      setTypingId(last.id)
      return
    }
    setConfused(true)
    const done = setTimeout(() => setConfused(false), 4000)
    return () => clearTimeout(done)
  }, [thinking, messages])

  const [reading, setReading] = React.useState(false)
  React.useEffect(() => {
    if (!thinking) return
    const swap = setInterval(() => setReading((r) => !r), READ_SWAP_MS)
    return () => {
      clearInterval(swap)
      setReading(false)
    }
  }, [thinking])

  const [rest, setRest] = React.useState<"awake" | "bored" | "drowsy" | "asleep">("awake")
  const restRef = React.useRef(rest)
  React.useEffect(() => {
    restRef.current = rest
  }, [rest])
  const busy = thinking || listening || typingId !== null || confused
  const lastActive = React.useRef(0)
  React.useEffect(() => {
    lastActive.current = performance.now()
    const onActive = (e: Event) => {
      lastActive.current = performance.now()
      const b = bot.current
      const now = restRef.current
      if (now === "bored") setRest("awake")
      // Nodding off: any sign of life keeps it up (a poke cancels the doze).
      if (now === "drowsy") {
        if (b && typeof b.poke === "function") b.poke()
        setRest("awake")
      }
      // Asleep: only typing or a click wakes it (back to awake on masari-awake).
      if (now === "asleep" && e.type !== "pointermove" && e.type !== "wheel" && b && typeof b.wake === "function") b.wake()
    }
    const onAwake = () => {
      lastActive.current = performance.now()
      setRest("awake")
    }
    const onAsleep = () => setRest("asleep")
    const events = ["pointermove", "pointerdown", "keydown", "wheel"] as const
    events.forEach((ev) => window.addEventListener(ev, onActive, { passive: true }))
    window.addEventListener("masari-awake", onAwake)
    window.addEventListener("masari-asleep", onAsleep)
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, onActive))
      window.removeEventListener("masari-awake", onAwake)
      window.removeEventListener("masari-asleep", onAsleep)
    }
  }, [])
  React.useEffect(() => {
    const tick = setInterval(() => {
      if (busy) {
        lastActive.current = performance.now()
        return
      }
      const alone = performance.now() - lastActive.current
      if (restRef.current === "awake" && alone >= BORED_AFTER_MS) setRest("bored")
      else if (restRef.current === "bored" && alone >= SLEEP_AFTER_MS) setRest("drowsy")
    }, 1000)
    return () => clearInterval(tick)
  }, [busy])

  // Bored: a random mix along the top of the composer — walk somewhere, hop somewhere, or stand and do something
  // (wave, nod, a little dance…). When it ends it walks home.
  React.useEffect(() => {
    const b = bot.current
    if (rest !== "bored" || !b || typeof b.hopAlong !== "function") return
    const span = Math.min(260, window.innerWidth / 3) * (dir === "rtl" ? 1 : -1)
    let at = 0
    let next: ReturnType<typeof setTimeout>
    const somewhere = () => {
      let to = at
      while (Math.abs(to - at) < 0.25) to = Math.random()
      at = to
      return [[to * span, 0]] as [number, number][]
    }
    const act = () => {
      const r = Math.random()
      if (r < 0.35) b.walkAlong(somewhere(), WALK_LEG_MS)
      else if (r < 0.65) b.hopAlong(somewhere(), HOP_MS)
      else {
        b.setAttribute("mood", BORED_MOVES[Math.floor(Math.random() * BORED_MOVES.length)])
        next = setTimeout(() => {
          b.setAttribute("mood", "idle")
          next = setTimeout(act, 500)
        }, 1900)
      }
    }
    const onArrive = () => {
      next = setTimeout(act, 600)
    }
    b.addEventListener("masari-arrived", onArrive)
    next = setTimeout(act, 300)
    return () => {
      clearTimeout(next)
      b.removeEventListener("masari-arrived", onArrive)
      b.walkAlong([[0, 0]], HOME_MS) // home; there it takes the `arrive` mood
    }
  }, [rest, dir])

  // Sleepy: once home, it yawns, nods off and falls asleep (masari-asleep).
  React.useEffect(() => {
    const b = bot.current
    if (rest !== "drowsy" || !b || typeof b.doze !== "function") return
    const doze = setTimeout(() => b.doze(), HOME_MS + 200)
    return () => clearTimeout(doze)
  }, [rest])

  const botMood: BotMood = listening
    ? "listening"
    : thinking
      ? reading
        ? "reading"
        : "thinking"
      : typingId
        ? "talking"
        : confused
          ? "confused"
          : rest === "asleep"
            ? "sleep"
            : "idle"

  // While an answer types itself out, keep its end in view.
  const lastScroll = React.useRef(0)
  const followTyping = React.useCallback(() => {
    const now = performance.now()
    if (now - lastScroll.current < 120) return
    lastScroll.current = now
    endRef.current?.scrollIntoView({ block: "end" })
  }, [])
  const doneTyping = React.useCallback(() => setTypingId(null), [])

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, thinking])

  const send = (text: string) => {
    if (!text.trim() || thinking) return
    sendMessage(text)
    setDraft("")
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* The screen minus the header (4rem + its 1px border) and, below lg, the bottom nav: only the messages scroll. */}
      <section className="flex h-[calc(100dvh-8rem-1px-env(safe-area-inset-bottom))] min-w-0 flex-col lg:h-[calc(100dvh-4rem-1px)]" aria-labelledby="chat-title">
        <h1 id="chat-title" className="sr-only">
          {t("chatTitle")}
        </h1>
        <MobilePanelButton />
        {/* relative: keeps the absolutely positioned sr-only labels inside the scroll area, not stretching the page. */}
        <div className="relative flex-1 overflow-y-auto">
          {messages.length === 0 && !thinking && <Welcome onPick={send} />}
          <div
            className={cn("mx-auto w-full max-w-3xl space-y-8 px-4 py-6 md:px-6", messages.length === 0 && !thinking && "hidden")}
            role="log"
            aria-live="polite"
          >
            {messages.map((m) =>
              m.role === "user" ? (
                <UserBubble key={m.id} text={typeof m.text === "string" ? m.text : tr(m.text)} />
              ) : (
                <AssistantMessage
                  key={m.id}
                  message={m}
                  typing={m.id === typingId ? { onTick: followTyping, onDone: doneTyping } : undefined}
                />
              )
            )}
            {thinking && <Typing />}
            <div ref={endRef} />
          </div>
        </div>

        {/* Composer, with Masari standing on its top edge */}
        <div className="relative border-t bg-background/90 backdrop-blur">
          <Bot
            ref={bot}
            mood={botMood}
            arrive={botMood}
            label={t("botChat")}
            className="masari-chat-bot"
          />
          <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-3 md:px-6">
            {listening && (
              <div className="flex items-center gap-2 rounded-lg bg-primary/8 px-3 py-2 text-sm text-primary" role="status">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
                </span>
                {t("listening")}
              </div>
            )}
            {voice.state === "transcribing" && (
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t("transcribing")}
              </div>
            )}
            {voice.error && (
              <div className="rounded-lg bg-destructive/8 px-3 py-2 text-sm text-destructive" role="alert">
                {voice.error === "permission" ? t("micPermission") : voice.error === "unsupported" ? t("micUnsupported") : t("micError")}
              </div>
            )}

            <form
              className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm focus-within:ring-3 focus-within:ring-ring/30"
              onSubmit={(e) => {
                e.preventDefault()
                send(draft)
              }}
            >
              <Button
                type="button"
                variant={listening ? "default" : "ghost"}
                size="icon-lg"
                className="size-11 shrink-0 rounded-xl"
                aria-pressed={listening}
                aria-label={listening ? t("stopListening") : t("voiceInput")}
                disabled={voice.state === "transcribing"}
                onClick={voice.toggle}
              >
                {listening ? <Square className="size-4 fill-current" /> : <Mic className="size-5" />}
              </Button>
              <label htmlFor="chat-input" className="sr-only">
                {t("chatPlaceholder")}
              </label>
              <Textarea
                id="chat-input"
                name="message"
                autoComplete="off"
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    send(draft)
                  }
                }}
                placeholder={t("chatPlaceholder")}
                className="max-h-40 min-h-11 flex-1 resize-none border-0 bg-transparent py-2.5 text-base shadow-none focus-visible:ring-0 dark:bg-transparent md:text-sm"
              />
              <Button type="submit" size="icon-lg" className="size-11 shrink-0 rounded-xl" disabled={!draft.trim() || thinking} aria-label={t("send")}>
                <SendHorizontal className="size-5 rtl:rotate-180" />
              </Button>
            </form>
          </div>
        </div>
      </section>

      <ContextPanel />
    </div>
  )
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="masari-sent max-w-[85%] rounded-2xl rounded-se-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-primary-foreground">{text}</p>
    </div>
  )
}

/** Masari's side of the conversation: no bubble, just the mark, the name and the AI label, then the text. */
function AssistantShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="flex gap-3">
      <AppIcon className="mt-0.5 size-7 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2.5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {t("appName")}
          <AiBadge className="h-5 border-0 bg-ai-soft px-1.5 text-[11px]" />
        </p>
        {children}
      </div>
    </div>
  )
}

type Typing = { onTick: () => void; onDone: () => void }

function AssistantMessage({ message, typing }: { message: Extract<ChatMessage, { role: "assistant" }>; typing?: Typing }) {
  if (message.kind === "error") return <ErrorReply detail={message.detail} />
  return <AiReply text={message.text} sources={message.sources} advisorEmail={message.advisorEmail} typing={typing} />
}

/** How long a fresh answer takes to type itself out: quick for short ones, never more than 6 s. */
const typeDuration = (chars: number) => Math.min(6000, Math.max(900, chars * 18))

/** The answer appearing as if typed. Calls onDone once it is all there (the bot stops talking then). */
function TypedText({ text, onTick, onDone }: { text: string } & Typing) {
  const [shown, setShown] = React.useState(0)
  const cb = React.useRef({ onTick, onDone })
  React.useEffect(() => {
    cb.current = { onTick, onDone }
  }, [onTick, onDone])
  React.useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const total = still ? 0 : typeDuration(text.length)
    const start = performance.now()
    let raf = 0
    const step = (now: number) => {
      const k = total ? Math.min(1, (now - start) / total) : 1
      setShown(Math.round(text.length * k))
      cb.current.onTick()
      if (k < 1) raf = requestAnimationFrame(step)
      else cb.current.onDone()
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [text])
  return (
    <>
      <SimpleMarkdown text={text.slice(0, shown)} />
      {shown < text.length && <span className="masari-caret" aria-hidden />}
    </>
  )
}

/** An answer from the Masari AI service (RAG over the regulations + the rule tools + Gemini). */
function AiReply({ text, sources, advisorEmail, typing }: { text: string; sources: RagSource[]; advisorEmail?: AdvisorEmail; typing?: Typing }) {
  const { t } = useI18n()
  // The extras (email, sources) come once the text has finished typing.
  const [typed, setTyped] = React.useState(!typing)
  const onDone = typing?.onDone
  const finish = React.useCallback(() => {
    setTyped(true)
    onDone?.()
  }, [onDone])
  return (
    <AssistantShell>
      <div className="max-w-[70ch] text-[15px] leading-7 text-foreground/90 text-pretty">
        {typing && !typed ? <TypedText text={text} onTick={typing.onTick} onDone={finish} /> : <SimpleMarkdown text={text} />}
      </div>
      {typed && advisorEmail && <AdvisorEmailActions email={advisorEmail} />}
      {typed && sources.length > 0 && (
        <details className="group text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">{t("ragSources")}</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {sources.map((s) => (
              <RagSourceChip key={s.id} title={s.title} />
            ))}
          </div>
        </details>
      )}
    </AssistantShell>
  )
}

/** Under an answer that wrote an advisor email: open it ready in Gmail, or copy it.
 *  The student reviews and sends it themselves; nothing is sent from here. */
function AdvisorEmailActions({ email }: { email: AdvisorEmail }) {
  const { t } = useI18n()
  const [copied, setCopied] = React.useState(false)
  const to = email.to.includes("@") ? email.to : "" // a "[advisor email]" placeholder is left for the student
  // Gmail's compose page, for students who use Gmail in the browser and have no email app set up.
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`

  const copy = () => {
    const text = `${email.to}\n${email.subject}\n\n${email.body}`
    const done = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
    // Some browsers block the Clipboard API (permissions, embedded views); fall back to a hidden textarea.
    const fallback = () => {
      const area = document.createElement("textarea")
      area.value = text
      area.style.position = "fixed"
      area.style.opacity = "0"
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand("copy")
      area.remove()
      if (ok) done()
    }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, fallback)
    else fallback()
  }

  return (
    <div className="flex max-w-[70ch] flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          nativeButton={false}
          render={<a href={gmail} target="_blank" rel="noopener noreferrer" />}
          size="sm"
          className="h-9 gap-1.5"
        >
          <ExternalLink className="size-4" aria-hidden />
          {t("advisorEmailGmail")}
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={copy}>
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? t("advisorEmailCopied") : t("advisorEmailCopy")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("advisorEmailHint")}</p>
    </div>
  )
}

function ErrorReply({ detail }: { detail: string }) {
  const { t } = useI18n()
  return (
    <AssistantShell>
      <div className="rounded-xl border border-destructive/30 bg-destructive/8 px-3.5 py-3 text-sm text-destructive" role="alert">
        {detail === RATE_LIMITED ? (
          <p className="font-medium">{t("chatTooMany")}</p>
        ) : detail === MODEL_BUSY ? (
          <p className="font-medium">{t("chatBusy")}</p>
        ) : (
          <>
            <p className="font-medium">{t("chatError")}</p>
            <p className="mt-1 text-xs opacity-80" dir="ltr">
              {detail}
            </p>
          </>
        )}
      </div>
    </AssistantShell>
  )
}

type Block = { kind: "p" | "h" | "ul" | "ol"; lines: string[] }

/** Renders the Markdown the model uses: headings, paragraphs, "-" / "*" / "1." lists, **bold** and `code`. */
function SimpleMarkdown({ text }: { text: string }) {
  const blocks: Block[] = []
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) {
      blocks.push({ kind: "p", lines: [] }) // a blank line ends the current paragraph or list
      continue
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    const bullet = line.match(/^[-*•]\s+(.*)$/)
    const numbered = line.match(/^\d+[.)]\s+(.*)$/)
    const kind: Block["kind"] = heading ? "h" : bullet ? "ul" : numbered ? "ol" : "p"
    const content = heading?.[1] ?? bullet?.[1] ?? numbered?.[1] ?? line
    const last = blocks.at(-1)
    // List items group together; every other line is its own paragraph or heading.
    if (last && last.kind === kind && (kind === "ul" || kind === "ol") && last.lines.length) last.lines.push(content)
    else blocks.push({ kind, lines: [content] })
  }
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return (
          <strong key={i} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        )
      if (part.startsWith("`") && part.endsWith("`"))
        return (
          <code key={i} dir="ltr" className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
            {part.slice(1, -1)}
          </code>
        )
      return part
    })
  return (
    <div className="space-y-3">
      {blocks
        .filter((b) => b.lines.length)
        .map((b, i) => {
          if (b.kind === "h")
            return (
              <p key={i} className="pt-1 font-semibold text-foreground">
                {inline(b.lines[0])}
              </p>
            )
          if (b.kind === "p") return <p key={i}>{inline(b.lines[0])}</p>
          const List = b.kind
          return (
            <List key={i} className={cn("space-y-1.5 ps-5 marker:text-muted-foreground", b.kind === "ul" ? "list-disc" : "list-decimal")}>
              {b.lines.map((l, j) => (
                <li key={j} className="ps-1">
                  {inline(l)}
                </li>
              ))}
            </List>
          )
        })}
    </div>
  )
}

/** Empty chat: a greeting with the student's name and a few simple questions to start from. */
function Welcome({ onPick }: { onPick: (text: string) => void }) {
  const { t, tr, lang } = useI18n()
  const { student } = useStudentView()
  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center gap-8 px-4 py-10 text-center md:px-6">
      <div className="space-y-3">
        <AppIcon className="mx-auto size-12" />
        <h2 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
          {lang === "ar" ? `أهلاً يا ${tr(student.name)}` : `Hi ${tr(student.name)}`}
        </h2>
        <p className="mx-auto max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground text-pretty">{t("chatWelcome")}</p>
      </div>
      <ul className="grid w-full grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2" aria-label={t("suggestions")}>
        {chatSuggestions.map((s) => (
          <li key={s.en}>
            <button
              type="button"
              onClick={() => onPick(tr(s))}
              className="h-full min-h-12 w-full rounded-xl border bg-card px-4 py-3 text-start text-sm leading-snug transition-colors hover:border-primary/40 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {tr(s)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Typing() {
  return (
    <AssistantShell>
      <div className="flex w-fit gap-1 rounded-xl border bg-card px-4 py-3" aria-label="…">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
    </AssistantShell>
  )
}

function ContextPanel() {
  return (
    <aside className="relative hidden h-[calc(100dvh-4rem-1px)] overflow-y-auto border-s bg-card p-5 lg:block">
      <PanelContent />
    </aside>
  )
}

/** Phones: the side panel does not fit, so a button above the chat opens it in a sheet. */
function MobilePanelButton() {
  const { t, dir } = useI18n()
  const { chats } = useDemoState()
  const [open, setOpen] = React.useState(false)
  return (
    <div className="flex justify-start border-b bg-background/90 px-4 py-2 backdrop-blur lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<Button variant="outline" size="sm" className="h-9 gap-1.5" />}>
          <History className="size-4" aria-hidden />
          {t("recentChats")}
          {chats.length > 0 && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{chats.length}</span>}
        </SheetTrigger>
        {/* Opens from the reading start: right in Arabic, left in English. */}
        <SheetContent side={dir === "rtl" ? "right" : "left"} className="overflow-y-auto p-5 pt-12">
          <SheetTitle className="sr-only">{t("recentChats")}</SheetTitle>
          <PanelContent onDone={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  )
}

/** New chat, recent chats and what Masari knows about the student. `onDone` closes the mobile sheet. */
function PanelContent({ onDone }: { onDone?: () => void }) {
  const { t, tr, num, lang } = useI18n()
  const { newChat, chats, chatId, openChat, deleteChat } = useDemoState()
  const { student } = useStudentView()
  const rows: [string, string][] = [
    [t("gpa"), student.gpa === null ? "—" : num(student.gpa, { minimumFractionDigits: 1 })],
    [t("earned"), `${num(student.earned)} / ${num(student.total)}`],
    [t("maxLoad"), `${num(student.maxLoad)} ${t("creditsShort")}`],
    [t("level"), tr(student.level)],
  ]
  const day = new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US", { day: "numeric", month: "short" })
  return (
    <div className="space-y-6">
      <Button
        variant="outline"
        className="h-10 w-full gap-2"
        onClick={() => {
          newChat()
          onDone?.()
        }}
      >
        <Plus className="size-4" />
        {t("newChat")}
      </Button>

      {/* Recent chats, saved to the student's account */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <History className="size-4 text-muted-foreground" aria-hidden />
          {t("recentChats")}
        </h3>
        {chats.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">{t("noRecentChats")}</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-1">
            {chats.map((c) => (
              <li key={c.id} className="group relative">
                <button
                  type="button"
                  onClick={() => {
                    openChat(c.id)
                    onDone?.()
                  }}
                  aria-current={c.id === chatId ? "true" : undefined}
                  className={cn(
                    "flex min-h-10 w-full flex-col gap-0.5 rounded-md px-2.5 py-2 pe-9 text-start text-sm transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    c.id === chatId && "bg-primary/8 font-medium"
                  )}
                >
                  <span className="line-clamp-2 leading-snug">{c.title || t("newChat")}</span>
                  <span className="text-[11px] text-muted-foreground">{day.format(c.updatedAt)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteChat(c.id)}
                  aria-label={`${t("deleteChat")}: ${c.title}`}
                  title={t("deleteChat")}
                  className="absolute end-1 top-1.5 grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t("contextPanel")}</h3>
        <dl className="divide-y rounded-lg border bg-card text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
