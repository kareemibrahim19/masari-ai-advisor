"use client"

import * as React from "react"
import { BookOpenText, Loader2, Mic, Plus, SendHorizontal, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { AppIcon } from "@/components/masari/brand"
import { AiBadge, RagSourceChip } from "@/components/masari/trust"
import { chatSuggestions, sources } from "@/lib/demo-content"
import { useDemoState, type ChatMessage, type RagSource } from "@/lib/demo-state"
import { useI18n } from "@/lib/i18n"
import { useStudentView } from "@/lib/student-context"
import { useVoiceInput } from "@/lib/use-voice-input"
import { cn } from "@/lib/utils"

export default function ChatPage() {
  const { t, tr } = useI18n()
  // Chat history lives in the shared demo state, so it survives switching pages.
  const { messages, thinking, sendMessage } = useDemoState()
  const [draft, setDraft] = React.useState("")
  // Voice: the transcript lands in the composer so the student can check it before sending.
  const voice = useVoiceInput(React.useCallback((text: string) => setDraft((d) => (d.trim() ? `${d.trim()} ${text}` : text)), []))
  const listening = voice.state === "recording"
  const endRef = React.useRef<HTMLDivElement>(null)

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
      <section className="flex h-[calc(100dvh-8rem-env(safe-area-inset-bottom))] min-w-0 flex-col lg:h-[calc(100dvh-4rem)]" aria-labelledby="chat-title">
        <h1 id="chat-title" className="sr-only">
          {t("chatTitle")}
        </h1>
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
                <AssistantMessage key={m.id} message={m} />
              )
            )}
            {thinking && <Typing />}
            <div ref={endRef} />
          </div>
        </div>

        {/* Composer */}
        <div className="border-t bg-background/90 backdrop-blur">
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
      <p className="max-w-[85%] rounded-2xl rounded-se-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-primary-foreground">{text}</p>
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

function AssistantMessage({ message }: { message: Extract<ChatMessage, { role: "assistant" }> }) {
  if (message.kind === "error") return <ErrorReply detail={message.detail} />
  return <AiReply text={message.text} sources={message.sources} />
}

/** An answer from the Masari AI service (RAG over the regulations + the rule tools + Gemini). */
function AiReply({ text, sources }: { text: string; sources: RagSource[] }) {
  const { t } = useI18n()
  return (
    <AssistantShell>
      <div className="max-w-[70ch] text-[15px] leading-7 text-foreground/90 text-pretty">
        <SimpleMarkdown text={text} />
      </div>
      {sources.length > 0 && (
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

function ErrorReply({ detail }: { detail: string }) {
  const { t } = useI18n()
  return (
    <AssistantShell>
      <div className="rounded-xl border border-destructive/30 bg-destructive/8 px-3.5 py-3 text-sm text-destructive" role="alert">
        <p className="font-medium">{t("chatError")}</p>
        <p className="mt-1 text-xs opacity-80" dir="ltr">
          {detail}
        </p>
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
  const { t, tr, num } = useI18n()
  const { newChat } = useDemoState()
  const { student } = useStudentView()
  const rows: [string, string][] = [
    [t("gpa"), student.gpa === null ? "—" : num(student.gpa, { minimumFractionDigits: 1 })],
    [t("earned"), `${num(student.earned)} / ${num(student.total)}`],
    [t("maxLoad"), `${num(student.maxLoad)} ${t("creditsShort")}`],
    [t("level"), tr(student.level)],
  ]
  return (
    <aside className="relative hidden h-[calc(100dvh-4rem)] space-y-6 overflow-y-auto border-s bg-card p-5 lg:block">
      <Button variant="outline" className="h-10 w-full gap-2" onClick={newChat}>
        <Plus className="size-4" />
        {t("newChat")}
      </Button>
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
        <div className="rounded-lg border bg-card p-3 text-sm">
          <p className="mb-1 text-xs text-muted-foreground">{t("yourPreferences")}</p>
          <p className="font-medium">{tr(student.preferences.summary)}</p>
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <BookOpenText className="size-4 text-source" aria-hidden />
          {t("sourcesUsed")}
        </h3>
        <ul className="space-y-2">
          {Object.values(sources).map((s) => (
            <li key={s.id} className="rounded-lg border bg-card p-3">
              <p className="text-sm font-medium">{tr(s.title)}</p>
              <p className="text-xs text-muted-foreground">{tr(s.locator)}</p>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  )
}
