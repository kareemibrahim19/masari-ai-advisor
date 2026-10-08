"use client"

import * as React from "react"
import { BookOpenText, CheckCircle2, Loader2, Mic, Plus, SendHorizontal, Square, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { AppIcon } from "@/components/masari/brand"
import { CategoryTag, Code, SlotTag } from "@/components/masari/bits"
import { AiExplanation, ConfidenceMeter, RagSourceChip, SourceChip, VerifiedBadge } from "@/components/masari/trust"
import {
  chatSuggestions,
  confidenceFromResponses,
  courseNames,
  defaultPrefs,
  demoCompatibility,
  ineligibleCourses,
  instructors,
  proposedNow,
  recommendedCourses,
  sources,
  student,
} from "@/lib/mock-data"
import { useDemoState, type ChatMessage, type RagSource } from "@/lib/demo-state"
import { useI18n } from "@/lib/i18n"
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
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 md:px-6" role="log" aria-live="polite">
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
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label={t("suggestions")}>
              {chatSuggestions.map((s) => (
                <button
                  key={s.en}
                  type="button"
                  onClick={() => send(tr(s))}
                  className="h-9 shrink-0 rounded-full border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {tr(s)}
                </button>
              ))}
            </div>

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

function AssistantShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="flex gap-3">
      <AppIcon className="mt-0.5 size-8" />
      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground">{t("appName")}</p>
        {children}
      </div>
    </div>
  )
}

function AssistantMessage({ message }: { message: Extract<ChatMessage, { role: "assistant" }> }) {
  if (message.kind === "ai") return <AiReply text={message.text} sources={message.sources} />
  if (message.kind === "error") return <ErrorReply detail={message.detail} />
  if (message.kind === "recommendation") return <RecommendationReply />
  if (message.kind === "prereq") return <PrereqReply />
  return <DemoReply />
}

/** A real answer from the Masari AI service (RAG over the regulations + Gemini). */
function AiReply({ text, sources }: { text: string; sources: RagSource[] }) {
  const { t } = useI18n()
  return (
    <AssistantShell>
      <AiExplanation>
        <SimpleMarkdown text={text} />
      </AiExplanation>
      {sources.length > 0 && (
        <details className="group text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">{t("ragSources")}</summary>
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

/** Renders the subset of Markdown the model uses: paragraphs, "-" / "*" / "1." lists and **bold**. */
function SimpleMarkdown({ text }: { text: string }) {
  const blocks: { list: "ul" | "ol" | null; lines: string[] }[] = []
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    const bullet = line.match(/^[-*•]\s+(.*)$/)
    const numbered = line.match(/^\d+[.)]\s+(.*)$/)
    const list = bullet ? "ul" : numbered ? "ol" : null
    const content = bullet?.[1] ?? numbered?.[1] ?? line.replace(/^#+\s*/, "")
    const last = blocks.at(-1)
    if (list && last?.list === list) last.lines.push(content)
    else blocks.push({ list, lines: [content] })
  }
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part
    )
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        if (!b.list) return <p key={i}>{inline(b.lines[0])}</p>
        const List = b.list
        return (
          <List key={i} className={cn("space-y-1 ps-5", b.list === "ul" ? "list-disc" : "list-decimal")}>
            {b.lines.map((l, j) => (
              <li key={j}>{inline(l)}</li>
            ))}
          </List>
        )
      })}
    </div>
  )
}

function RecommendationReply() {
  const { t, tr, num, lang } = useI18n()
  // The planner's proposal for this term: already checked for prerequisites, credit thresholds and the load limit.
  const picks = recommendedCourses.filter((c) => proposedNow.includes(c.code))
  const credits = picks.reduce((s, c) => s + c.credits, 0)
  const course = "ECE 321"
  const best = instructors
    .filter((i) => i.courseCode === course)
    .map((i) => ({ ...i, score: demoCompatibility(i.profile, defaultPrefs) }))
    .filter((i) => confidenceFromResponses(i.responses) !== "low")
    .sort((a, b) => b.score - a.score)[0]

  return (
    <AssistantShell>
      {/* Verified facts from the rules engine */}
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <VerifiedBadge />
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-verified">
            <CheckCircle2 className="size-3.5" aria-hidden />
            {num(credits)} / {num(student.maxLoad)} {t("creditsShort")} · {t("loadOk")}
          </span>
        </div>
        <ol className="space-y-2">
          {picks.map((c, i) => (
            <li key={c.code} className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2">
              <span className="text-xs font-bold text-muted-foreground tabular-nums">{num(i + 1)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{tr(c.name)}</p>
                <p className="text-xs text-muted-foreground">
                  <Code>{c.code}</Code> · {num(c.credits)} {t("creditsShort")}
                </p>
              </div>
              {c.slot && <SlotTag slot={c.slot} className="hidden sm:inline-flex" />}
              <CategoryTag category={c.category} className="hidden sm:inline-flex" />
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs">
          <XCircle className="size-3.5 text-destructive" aria-hidden />
          <span className="text-muted-foreground">{t("notEligible")}:</span>
          {ineligibleCourses.map((c) => (
            <span key={c.code} className="rounded-md bg-destructive/8 px-1.5 py-0.5 text-destructive">
              <Code>{c.code}</Code>
            </span>
          ))}
        </div>
      </div>

      {/* Instructor suggestion */}
      <div className="space-y-2 rounded-xl border bg-card p-4">
        <p className="text-xs text-muted-foreground">
          {t("forCourse")}: <span className="font-medium text-foreground">{tr(courseNames[course])}</span> <Code>{course}</Code>
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{tr(best.name)}</p>
            <p className="text-xs text-muted-foreground">
              {t("section")} {num(Number(best.section))}
            </p>
          </div>
          <div className="text-end">
            <p className="text-2xl font-bold text-primary tabular-nums">{num(best.score)}%</p>
            <p className="text-xs text-muted-foreground">{t("compatibility")}</p>
          </div>
        </div>
        <ConfidenceMeter level={confidenceFromResponses(best.responses)} responses={best.responses} />
      </div>

      <AiExplanation>
        {lang === "ar"
          ? `رشحتلك ${num(picks.length)} مقررات بمجموع ${num(credits)} ساعة، وده تحت الحد المسموح ليك (${num(student.maxLoad)}). بدأت بـ Communication Networks لأنه المتطلب الوحيد لاختياري IoT، وبعده مشروع التخرج (1) لأنه بيتسجل في الربيع بس. Deep Learning مش في القايمة لأنك محتاج تعدّي Neural Networks الأول. بالنسبة لـ Communication Networks، ${tr(best.name)} الأقرب لتفضيلك بناءً على ${num(best.responses)} تقييم سابق.`
          : `I suggest ${picks.length} courses totalling ${credits} credit hours, under your limit of ${student.maxLoad}. Communication Networks comes first because it is the only prerequisite for the IoT elective, then Project (1) because it runs in Spring only. Deep Learning is not on the list because you need to pass Neural Networks first. For Communication Networks, ${tr(best.name)} is closest to your preferences, based on ${best.responses} past evaluations.`}
      </AiExplanation>

      <div className="flex flex-wrap gap-2">
        <SourceChip sourceId="catalog" />
        <SourceChip sourceId="load" />
        <SourceChip sourceId="training" />
      </div>
    </AssistantShell>
  )
}

function PrereqReply() {
  const { t, tr, lang } = useI18n()
  const rows: { code: string; requires: string; ok: boolean; note?: string }[] = [
    { code: "CSE 351", requires: "ECE 332", ok: false },
    { code: "ECE 332", requires: "BAS 218", ok: true, note: lang === "ar" ? "بيتدرّس خريف فقط" : "Fall only" },
  ]
  return (
    <AssistantShell>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <VerifiedBadge />
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.code} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{tr(courseNames[r.code])}</span>
              <Code className="text-xs text-muted-foreground">{r.code}</Code>
              <span className="text-muted-foreground">{t("requires")}</span>
              <Code>{r.requires}</Code>
              {r.ok ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-verified-soft px-2 py-0.5 text-xs font-medium text-verified">
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  {t("prereqsMet")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-destructive/8 px-2 py-0.5 text-xs font-medium text-destructive">
                  <XCircle className="size-3.5" aria-hidden />
                  {t("missingPrereq")}
                </span>
              )}
              {r.note && <span className="text-xs text-muted-foreground">· {r.note}</span>}
            </li>
          ))}
        </ul>
      </div>
      <AiExplanation>
        {lang === "ar"
          ? "مش هتقدر تسجل Deep Learning (CSE 351) لأن متطلبه السابق Neural Networks (ECE 332) وإنت سقطت فيه. Neural Networks بيتدرّس في الخريف بس، فأقرب فرصة تعيده خريف 2027 (وأعلى تقدير هيبقى B+)، وبعدها تسجل Deep Learning في ربيع 2028."
          : "You can't register for Deep Learning (CSE 351) because its prerequisite, Neural Networks (ECE 332), is not passed yet. Neural Networks runs in Fall only, so the earliest retake is Fall 2027 (capped at B+), and then you can take Deep Learning in Spring 2028."}
      </AiExplanation>
      <div className="flex flex-wrap gap-2">
        <SourceChip sourceId="catalog" />
        <SourceChip sourceId="retake" />
      </div>
    </AssistantShell>
  )
}

function DemoReply() {
  const { t } = useI18n()
  return (
    <AssistantShell>
      <AiExplanation>{t("demoReply")}</AiExplanation>
    </AssistantShell>
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
  const rows: [string, string][] = [
    [t("gpa"), num(student.gpa, { minimumFractionDigits: 1 })],
    [t("earned"), `${num(student.earned)} / ${num(student.total)}`],
    [t("maxLoad"), `${num(student.maxLoad)} ${t("creditsShort")}`],
    [t("level"), tr(student.level)],
  ]
  return (
    <aside className="hidden h-[calc(100dvh-4rem)] space-y-6 overflow-y-auto border-s bg-card p-5 lg:block">
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
