"use client"

/**
 * The student's weekly timetable for the current term (lib/timetable.ts), next to "Ask Masari".
 * One table on every screen: the days across, the six periods down, days off as a narrow column. On phones the
 * table scrolls sideways inside its card while the period column stays put.
 */
import * as React from "react"
import { CalendarOff, FlaskConical, MapPin, PencilRuler, Presentation } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Code, PageHeader } from "@/components/masari/bits"
import { type DictKey, useI18n } from "@/lib/i18n"
import { useStudentView } from "@/lib/student-context"
import { DAYS, PERIODS, dayNames, type Day, type Session, type SessionKind } from "@/lib/timetable"
import { cn } from "@/lib/utils"

const kinds: Record<
  SessionKind,
  { label: DictKey; icon: React.ComponentType<{ className?: string }>; box: string; ink: string }
> = {
  lecture: {
    label: "ttKindLecture",
    icon: Presentation,
    box: "border-brand-accent/35 bg-brand-accent/10",
    ink: "text-brand-accent",
  },
  lab: { label: "ttKindLab", icon: FlaskConical, box: "border-ai/30 bg-ai-soft", ink: "text-ai" },
  tutorial: { label: "ttKindTutorial", icon: PencilRuler, box: "border-verified/30 bg-verified-soft", ink: "text-verified" },
}

/** "13:40" → "1:40", 12-hour like the faculty writes them. */
const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`
}

export default function SchedulePage() {
  const { t, tr } = useI18n()
  const { student } = useStudentView()
  const tt = student.timetable

  const at = (d: Day, period: number) => tt.sessions.find((s) => s.day === d && s.period === period)
  const hours = (tt.sessions.length * 90) / 60
  const off = (d: Day) => tt.restDays.includes(d)
  // Phones: fixed widths, and the table scrolls sideways. Wide screens: the columns share the width.
  const narrow = `4.75rem ${DAYS.map((d) => (off(d) ? "2.75rem" : "9rem")).join(" ")}`
  const wide = `minmax(7rem, 0.7fr) ${DAYS.map((d) => (off(d) ? "minmax(3rem, 0.35fr)" : "minmax(0, 1fr)")).join(" ")}`

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
      <PageHeader title={t("ttTitle")} subtitle={`${tr(student.level)} · ${t("ttSection")} ${tt.section}`} />

      {tt.sessions.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
            <CalendarOff className="size-5" aria-hidden />
            {t("ttEmpty")}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 md:max-w-2xl">
            <Stat
              value={String(tt.studyDays.length)}
              label={t("ttDays")}
              detail={tt.studyDays.map((d) => tr(dayNames[d])).join("، ")}
            />
            <Stat value={String(tt.sessions.length)} label={t("ttClasses")} />
            <Stat value={String(hours)} label={t("ttHours")} />
          </div>

          {/* relative: keeps the absolutely positioned sr-only labels inside the scroll box, not widening the page. */}
          <div className="relative overflow-x-auto rounded-2xl border bg-card">
            <div
              className="grid w-max [grid-template-columns:var(--cols-narrow)] md:w-auto md:[grid-template-columns:var(--cols-wide)]"
              style={{ "--cols-narrow": narrow, "--cols-wide": wide } as React.CSSProperties}
              role="table"
              aria-label={t("ttTitle")}
            >
              <div role="row" className="contents">
                <div
                  role="columnheader"
                  className="sticky start-0 z-10 border-b bg-muted px-2.5 py-3 text-xs font-medium text-muted-foreground md:px-3"
                >
                  {t("ttPeriod")}
                </div>
                {DAYS.map((d) => (
                  <div
                    key={d}
                    role="columnheader"
                    className="border-b border-s bg-muted/50 px-2 py-3 text-center text-sm font-semibold"
                  >
                    {tr(dayNames[d])}
                  </div>
                ))}
              </div>

              {PERIODS.map((p) => (
                <div role="row" className="contents" key={p.n}>
                  <div role="rowheader" className="sticky start-0 z-10 border-b bg-card px-2.5 py-3 md:px-3">
                    <p className="text-[13px] font-medium md:text-sm">{tr(p.name)}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums md:text-xs" dir="ltr">
                      {clock(p.start)} – {clock(p.end)}
                    </p>
                  </div>
                  {DAYS.map((d) => {
                    if (tt.restDays.includes(d)) {
                      // One tall "day off" cell for the whole column, drawn on the first row.
                      return p.n === 1 ? (
                        <div
                          key={d}
                          role="cell"
                          className="flex items-center justify-center border-s bg-[repeating-linear-gradient(135deg,transparent_0_10px,var(--muted)_10px_11px)]"
                          style={{ gridRow: `2 / span ${PERIODS.length}`, gridColumn: DAYS.indexOf(d) + 2 }}
                        >
                          <span className="rounded-full bg-background px-1.5 py-2.5 text-xs font-medium text-muted-foreground [writing-mode:vertical-rl]">
                            {t("ttRest")}
                          </span>
                        </div>
                      ) : null
                    }
                    const s = at(d, p.n)
                    return (
                      <div key={d} role="cell" className="min-h-24 border-b border-s p-1.5">
                        {s ? <SessionCard s={s} /> : <span className="sr-only">{t("ttFree")}</span>}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function SessionCard({ s }: { s: Session }) {
  const { t, tr } = useI18n()
  const k = kinds[s.kind]
  const Icon = k.icon
  return (
    <div className={cn("h-full rounded-xl border px-2.5 py-2 md:px-3 md:py-2.5", k.box)}>
      <p className={cn("flex items-center gap-1.5 text-[11px] font-semibold", k.ink)}>
        <Icon className="size-3.5" aria-hidden />
        {t(k.label)}
      </p>
      <p className="mt-1 text-[13px] leading-snug font-semibold text-pretty md:text-sm">{tr(s.name)}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <Code className="text-[11px]">{s.code}</Code>
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3" aria-hidden />
          <span className="sr-only">{t("ttRoom")}</span>
          {tr(s.room)}
        </span>
      </p>
    </div>
  )
}

function Stat({ value, label, detail }: { value: string; label: string; detail?: string }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="px-3 py-3 sm:px-4 sm:py-4">
        <p className="text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
        <p className="text-[11px] leading-snug text-muted-foreground sm:text-xs">{label}</p>
        {detail && <p className="mt-1 hidden truncate text-xs text-foreground/80 sm:block">{detail}</p>}
      </CardContent>
    </Card>
  )
}
