"use client"

import type { CSSProperties } from "react"
import Link from "next/link"
import { AlertTriangle, Armchair, BellRing, CalendarDays, CalendarRange, Info, MessageSquareText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Bar, CategoryTag, Code, CountUp, FlipText, Ring } from "@/components/masari/bits"
import { JourneyRail } from "@/components/masari/journey"
import { PriorityLevel } from "@/components/masari/priority-level"
import { useI18n } from "@/lib/i18n"
import { semesterLabel, useGraduationPlan, usePlanChoice } from "@/lib/plan-api"
import { formatLongDate, upcomingReminders, useNow, useToday } from "@/lib/reminders"
import { useRegistrationOpen, useRegistrationPhase } from "@/lib/registration"
import { useSeatRequests } from "@/lib/seat-requests"
import { useGraduationDelays } from "@/lib/graduation-delays"
import { useStudentView } from "@/lib/student-context"
import { rankCurrentCourses } from "@/lib/student-view"
import { cn } from "@/lib/utils"

const alertStyle = {
  warning: { icon: AlertTriangle, cls: "bg-warning-soft text-warning" },
  info: { icon: Info, cls: "bg-muted text-foreground" },
  seat: { icon: Armchair, cls: "bg-highlight-soft text-highlight-ink" },
} as const

/** Entrance for the i-th row of a list: fade up, each row a little after the one before. */
const rise = (i: number): CSSProperties => ({ animation: `masari-in .4s ease ${0.15 + i * 0.06}s both` })

export default function DashboardPage() {
  const { t, tr, num, lang } = useI18n()
  const { alerts, currentCourses, electiveCategories, requirementGroups, student } = useStudentView()
  const remaining = student.total - student.earned
  const seats = useSeatRequests(student.id)
  const registrationOpen = useRegistrationOpen()
  const seatNotices = useRegistrationPhase() !== "gone"
  // Once registration has been closed a few days, the seat notices go (registration is over).
  const shownAlerts = alerts.filter((a) => seatNotices || a.kind !== "seat")
  // What the rules-engine planner would register this term (prerequisites, credit thresholds and load limit checked).
  const delays = useGraduationDelays(student.id)
  const thisTerm = rankCurrentCourses(currentCourses, delays)
  const currentCredits = thisTerm.reduce((s, c) => s + c.credits, 0)
  // The path and the estimate follow the target the student picked on the plan page (no what-if here).
  const [choice] = usePlanChoice(student.id, student.finishTarget)
  const { data, error, loading } = useGraduationPlan({
    studentId: student.id,
    targetYears: choice.target,
    allowSummer: choice.summer,
    failedCourses: [],
    expectedTermGpa: null,
  })
  const plan = error ? null : (data?.plan ?? null)
  const last = plan?.terms[plan.terms.length - 1]
  const grad = plan ? (last ? semesterLabel(last.term, last.academic_year, lang) : tr(plan.current_term)) : tr(student.estGraduation)
  const targetKey = ({ 4: "years4", 4.5: "years45", 5: "years5" } as const)[choice.target]
  // Today's date next to the greeting, and calendar dates in the next 5 days as alerts.
  const today = useToday()
  const now = useNow()
  const reminders = now ? upcomingReminders(now) : []

  return (
    <div className="mx-auto w-full max-w-7xl space-y-10 px-4 py-6 md:px-6 md:py-10">
      {/* Hero: greeting + the path. The path is the one memorable element of the page. */}
      <section aria-labelledby="hero-title" className="space-y-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1 id="hero-title" className="text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">
                {t("greeting")}
                {lang === "ar" ? "، " : ", "}
                {tr(student.name)}
              </h1>
              {today && (
                <p className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm font-medium text-muted-foreground">
                  <CalendarDays className="size-4 text-primary" aria-hidden />
                  <time dateTime={today}>{formatLongDate(today, lang)}</time>
                </p>
              )}
            </div>
            <p className="max-w-[52ch] text-base leading-relaxed text-muted-foreground text-pretty md:text-lg">
              {lang === "ar" ? (
                <>
                  فاضلك <b className="font-semibold text-foreground tabular">{num(remaining)}</b> ساعة، والتخرج المتوقع{" "}
                  <b className="font-semibold text-foreground"><FlipText value={grad} /></b>.
                </>
              ) : (
                <>
                  <b className="font-semibold text-foreground tabular">{num(remaining)}</b> credit hours to go. Estimated graduation:{" "}
                  <b className="font-semibold text-foreground"><FlipText value={grad} /></b>.
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button nativeButton={false} render={<Link href="/chat" />} size="lg" className="gap-2">
              <MessageSquareText className="size-4" aria-hidden />
              {t("askMasari")}
            </Button>
            <Button nativeButton={false} render={<Link href="/plan" />} size="lg" variant="outline" className="gap-2">
              <CalendarRange className="size-4" aria-hidden />
              {t("navPlan")}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-card px-4 pt-5 pb-4 md:px-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">{t("pathTitle")}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {plan && (
                // Hovering the chip shows why the target is not possible; clicking it opens the plan page.
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Link
                        href="/plan"
                        className={cn(
                          "inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
                          plan.feasible ? "bg-muted" : "bg-warning-soft text-warning"
                        )}
                      />
                    }
                  >
                    {t("pathTarget")}: {t(targetKey)}
                    {!plan.feasible && ` · ${plan.status === "conditional" ? t("possibleIf") : t("pathTargetNotPossible")}`}
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-start leading-relaxed">
                    {plan.status === "conditional" && plan.conditions?.length
                      ? plan.conditions.map((c) => tr(c)).join(" ")
                      : !plan.feasible && plan.why
                        ? tr(plan.why)
                        : t("pathChangeTarget")}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
          <JourneyRail plan={plan} loading={loading} />
        </div>
      </section>

      {/* Standing: a plain stat row, no card per number */}
      <section aria-label={t("standing")} className="grid grid-cols-2 gap-y-6 border-y py-6 md:grid-cols-4 md:divide-x md:divide-border rtl:md:divide-x-reverse">
        <Stat label={t("gpa")}>
          <span className="flex items-center gap-3">
            <Ring value={student.gpa ?? 0} max={4} size={44} grow>
              <span className="sr-only">{student.gpa === null ? "—" : num(student.gpa)}</span>
            </Ring>
            {student.gpa === null ? (
              <span className="text-3xl font-semibold tabular">—</span>
            ) : (
              <CountUp value={student.gpa} decimals={1} format={{ minimumFractionDigits: 1 }} className="text-3xl font-semibold tabular" />
            )}
            <span className="self-end pb-1 text-sm text-muted-foreground">/ {num(4, { minimumFractionDigits: 1 })}</span>
          </span>
        </Stat>
        <Stat label={t("earned")}>
          <CountUp value={student.earned} className="text-3xl font-semibold tabular" />
          <span className="ms-1.5 text-sm text-muted-foreground tabular">/ {num(student.total)}</span>
        </Stat>
        <Stat label={t("remaining")}>
          <CountUp value={remaining} className="text-3xl font-semibold tabular" />
          <span className="ms-1.5 text-sm text-muted-foreground">{t("creditHours")}</span>
        </Stat>
        <Stat label={t("maxLoad")} hint={tr(student.maxLoadRule)}>
          <CountUp value={student.maxLoad} className="text-3xl font-semibold tabular" />
          <span className="ms-1.5 text-sm text-muted-foreground">{t("creditHours")}</span>
        </Stat>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* The courses registered this term, most important first */}
        <section aria-labelledby="next-title" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="next-title" className="text-xl font-semibold">
              {t("nextSemester")}
            </h2>
            <span className="text-sm text-muted-foreground tabular">
              {num(currentCredits)} {t("creditHours")}
            </span>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t("priorityHow")}</p>
          <ol className="divide-y overflow-hidden rounded-2xl border bg-card">
            {thisTerm.map((c, i) => (
              // Rows come in one after another (same motion as the rest of the page).
              <li key={c.code} className="flex items-center gap-4 px-4 py-3.5" style={rise(i)}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{tr(c.name)}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Code>{c.code}</Code>
                    <span className="tabular">
                      {num(c.credits)} {t("creditsShort")}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{tr(c.why)}</p>
                </div>
                <CategoryTag category={c.category} className="hidden sm:inline-flex" />
                <PriorityLevel score={c.priority} className="shrink-0" />
              </li>
            ))}
          </ol>
        </section>

        {/* Alerts */}
        <section aria-labelledby="alerts-title" className="space-y-4">
          <h2 id="alerts-title" className="text-xl font-semibold">
            {t("alerts")}
          </h2>
          {shownAlerts.length === 0 && reminders.length === 0 && (
            <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">{t("noAlerts")}</p>
          )}
          <ul className="space-y-3">
            {/* Calendar dates in the next 5 days, soonest first; redder as the day nears. */}
            {reminders.map((r, i) => (
              <li
                key={r.event.id}
                style={rise(i)}
                className={cn(
                  "flex gap-3 rounded-2xl border p-4",
                  r.urgency === 3 ? "border-destructive bg-destructive/10" : r.urgency === 2 ? "border-warning bg-warning-soft" : "border-warning/40 bg-warning-soft/40"
                )}
              >
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-[10px]",
                    r.urgency === 3 ? "bg-destructive text-white" : "bg-warning-soft text-warning"
                  )}
                >
                  <BellRing className="size-[18px]" aria-hidden />
                </span>
                <div className="min-w-0 space-y-1">
                  <p className={cn("font-semibold", r.urgency === 3 ? "text-destructive" : "text-foreground")}>
                    {tr(r.event.title)} · {tr(r.when)}
                  </p>
                  <p className="text-sm leading-relaxed text-foreground/80">{tr(r.body)}</p>
                </div>
              </li>
            ))}
            {shownAlerts.map((a, i) => {
              const s = alertStyle[a.kind]
              const Icon = s.icon
              return (
                <li key={a.id} className="flex gap-3 rounded-2xl border bg-card p-4" style={rise(reminders.length + i)}>
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-[10px]", s.cls)}>
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <div className="min-w-0 space-y-2">
                    <p className="font-medium">{tr(a.title)}</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">{tr(a.body)}</p>
                    {/* The seat request goes to the advisor from the timetable page, once for all full courses. */}
                    {a.seat && seats.loaded && (
                      <Link href="/schedule" className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
                        {t(
                          seats.isSent(a.seat.code, a.seat.section)
                            ? "seatGoSent"
                            : registrationOpen === false
                              ? "seatGoClosed"
                              : "seatGoSend"
                        )}
                      </Link>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      {/* Requirement progress */}
      <section aria-labelledby="req-title" className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="req-title" className="text-xl font-semibold">
            {t("gradProgress")}
          </h2>
          <span className="text-sm text-muted-foreground">{t("gradProgressDesc")}</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-4 sm:grid-cols-2">
            {requirementGroups.map((g) => {
              const done = g.earned >= g.required
              return (
                <li key={g.id} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">{tr(g.name)}</span>
                    <span className={cn("shrink-0 tabular", done ? "font-medium text-verified" : "text-muted-foreground")}>
                      {num(g.earned)}/{num(g.required)}
                    </span>
                  </div>
                  <Bar grow value={g.earned} max={g.required} className="h-1.5" barClassName={done ? "bg-verified" : "bg-brand-ink"} label={tr(g.name)} />
                </li>
              )
            })}
          </ul>
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">{t("electives")}</h3>
            <ul className="space-y-4">
              {electiveCategories.map((e) => (
                <li key={e.id} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span>{tr(e.name)}</span>
                    <span className="text-muted-foreground tabular">
                      {num(e.done)}/{num(e.required)}
                    </span>
                  </div>
                  <div className="flex gap-1.5" role="img" aria-label={`${tr(e.name)}: ${e.done}/${e.required}`}>
                    {Array.from({ length: e.required }, (_, i) => (
                      <span key={i} className={cn("h-2 flex-1 rounded-full", i < e.done ? "bg-highlight" : "bg-muted")} />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}

function Stat({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 px-0 md:px-6 md:first:ps-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="flex items-baseline">{children}</div>
      {hint && <p className="text-xs leading-snug text-muted-foreground">{hint}</p>}
    </div>
  )
}
