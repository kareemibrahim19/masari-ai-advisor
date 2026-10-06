"use client"

import Link from "next/link"
import { AlertTriangle, ArrowLeft, Armchair, CalendarRange, Info, MessageSquareText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Bar, CategoryTag, Code, Ring, SlotTag } from "@/components/masari/bits"
import { JourneyRail } from "@/components/masari/journey"
import { SourceChip, VerifiedBadge } from "@/components/masari/trust"
import { alerts, electiveCategories, proposedNow, recommendedCourses, requirementGroups, student } from "@/lib/mock-data"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const alertStyle = {
  warning: { icon: AlertTriangle, cls: "bg-warning-soft text-warning" },
  info: { icon: Info, cls: "bg-muted text-foreground" },
  seat: { icon: Armchair, cls: "bg-highlight-soft text-highlight-ink" },
} as const

export default function DashboardPage() {
  const { t, tr, num, lang } = useI18n()
  const remaining = student.total - student.earned
  // What the rules-engine planner would register this term (prerequisites, credit thresholds and load limit checked).
  const proposal = recommendedCourses.filter((c) => proposedNow.includes(c.code))
  const proposalCredits = proposal.reduce((s, c) => s + c.credits, 0)
  const grad = tr(student.estGraduation)

  return (
    <div className="mx-auto w-full max-w-7xl space-y-10 px-4 py-6 md:px-6 md:py-10">
      {/* Hero: greeting + the path. The path is the one memorable element of the page. */}
      <section aria-labelledby="hero-title" className="space-y-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h1 id="hero-title" className="text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">
              {t("greeting")}
              {lang === "ar" ? "، " : ", "}
              {tr(student.name)}
            </h1>
            <p className="max-w-[52ch] text-base leading-relaxed text-muted-foreground text-pretty md:text-lg">
              {lang === "ar" ? (
                <>
                  فاضلك <b className="font-semibold text-foreground tabular">{num(remaining)}</b> ساعة، والتخرج المتوقع{" "}
                  <b className="font-semibold text-foreground">{grad}</b>.
                </>
              ) : (
                <>
                  <b className="font-semibold text-foreground tabular">{num(remaining)}</b> credit hours to go. Estimated graduation:{" "}
                  <b className="font-semibold text-foreground">{grad}</b>.
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
            <VerifiedBadge />
          </div>
          <JourneyRail />
        </div>
      </section>

      {/* Standing: a plain stat row, no card per number */}
      <section aria-label={t("standing")} className="grid grid-cols-2 gap-y-6 border-y py-6 md:grid-cols-4 md:divide-x md:divide-border rtl:md:divide-x-reverse">
        <Stat label={t("gpa")}>
          <span className="flex items-center gap-3">
            <Ring value={student.gpa} max={4} size={44}>
              <span className="sr-only">{num(student.gpa)}</span>
            </Ring>
            <span className="text-3xl font-semibold tabular">{num(student.gpa, { minimumFractionDigits: 1 })}</span>
            <span className="self-end pb-1 text-sm text-muted-foreground">/ {num(4, { minimumFractionDigits: 1 })}</span>
          </span>
        </Stat>
        <Stat label={t("earned")}>
          <span className="text-3xl font-semibold tabular">{num(student.earned)}</span>
          <span className="ms-1.5 text-sm text-muted-foreground tabular">/ {num(student.total)}</span>
        </Stat>
        <Stat label={t("remaining")}>
          <span className="text-3xl font-semibold tabular">{num(remaining)}</span>
          <span className="ms-1.5 text-sm text-muted-foreground">{t("creditHours")}</span>
        </Stat>
        <Stat label={t("maxLoad")} hint={tr(student.maxLoadRule)}>
          <span className="text-3xl font-semibold tabular">{num(student.maxLoad)}</span>
          <span className="ms-1.5 text-sm text-muted-foreground">{t("creditHours")}</span>
        </Stat>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Next term proposal */}
        <section aria-labelledby="next-title" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="next-title" className="text-xl font-semibold">
              {t("nextSemester")}
            </h2>
            <span className="text-sm text-muted-foreground tabular">
              {num(proposalCredits)} / {num(student.maxLoad)} {t("creditHours")}
            </span>
          </div>
          <ol className="divide-y overflow-hidden rounded-2xl border bg-card">
            {proposal.map((c) => (
              <li key={c.code} className="flex items-center gap-4 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{tr(c.name)}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Code>{c.code}</Code>
                    <span className="tabular">
                      {num(c.credits)} {t("creditsShort")}
                    </span>
                    {c.slot && <SlotTag slot={c.slot} />}
                  </p>
                </div>
                <CategoryTag category={c.category} className="hidden sm:inline-flex" />
                <span className="w-14 text-end">
                  <span className="block text-lg font-semibold tabular">{num(c.priority)}</span>
                  <span className="block text-[11px] text-muted-foreground">{t("priority")}</span>
                </span>
              </li>
            ))}
          </ol>
          <Link
            href="/recommendations"
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-highlight-ink underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t("viewAll")}
            <ArrowLeft className="size-4 ltr:rotate-180" aria-hidden />
          </Link>
        </section>

        {/* Alerts */}
        <section aria-labelledby="alerts-title" className="space-y-4">
          <h2 id="alerts-title" className="text-xl font-semibold">
            {t("alerts")}
          </h2>
          <ul className="space-y-3">
            {alerts.map((a) => {
              const s = alertStyle[a.kind]
              const Icon = s.icon
              return (
                <li key={a.id} className="flex gap-3 rounded-2xl border bg-card p-4">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-[10px]", s.cls)}>
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <div className="min-w-0 space-y-2">
                    <p className="font-medium">{tr(a.title)}</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">{tr(a.body)}</p>
                    {a.sourceId && <SourceChip sourceId={a.sourceId} />}
                    {a.kind === "seat" && (
                      <Button variant="outline" size="sm" className="h-8">
                        {t("requestSeat")}
                      </Button>
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
          <VerifiedBadge />
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
                  <Bar value={g.earned} max={g.required} className="h-1.5" barClassName={done ? "bg-verified" : "bg-brand-ink"} label={tr(g.name)} />
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
            <SourceChip sourceId="graduation" />
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
