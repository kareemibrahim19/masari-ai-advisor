"use client"

import * as React from "react"
import { AlertTriangle, Check, CheckCircle2, LockKeyhole, Plus, Trophy, Unlock, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Bar, CategoryTag, Code, PageHeader, SlotTag } from "@/components/masari/bits"
import { AiExplanation, ConfidenceMeter, SourceChip, VerifiedBadge } from "@/components/masari/trust"
import { courseNames, dimensionLabels, type StudentPrefs, type TeachingProfile } from "@/lib/demo-content"
import { basisText, useInstructorCourses, useInstructorRanking } from "@/lib/data/instructor-source"
import { useStudentView } from "@/lib/student-context"
import type { RecommendedCourse } from "@/lib/student-view"
import { type RecTab, useDemoState } from "@/lib/demo-state"
import { type DictKey, useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export default function RecommendationsPage() {
  const { t } = useI18n()
  const { recTab, setRecTab } = useDemoState()
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <PageHeader title={t("recTitle")} subtitle={t("recSubtitle")} />
      <Tabs value={recTab} onValueChange={(v) => setRecTab(v as RecTab)} className="gap-5">
        <TabsList className="h-11! w-full sm:w-fit">
          <TabsTrigger value="courses" className="px-5">
            {t("tabCourses")}
          </TabsTrigger>
          <TabsTrigger value="instructors" className="px-5">
            {t("tabInstructors")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="courses">
          <CoursesTab />
        </TabsContent>
        <TabsContent value="instructors">
          <InstructorsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ------------------------------------------------------------------------------ Courses

function CoursesTab() {
  const { t, tr, num } = useI18n()
  const { selected, toggleCourse: toggle } = useDemoState()
  const { recommendedCourses, ineligibleCourses, student } = useStudentView()
  const load = recommendedCourses.filter((c) => selected.includes(c.code)).reduce((s, c) => s + c.credits, 0)
  const over = load > student.maxLoad

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <ol className="space-y-3">
        {recommendedCourses.map((c, i) => (
          <CourseCard key={c.code} course={c} rank={i + 1} added={selected.includes(c.code)} onToggle={() => toggle(c.code)} />
        ))}
      </ol>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        {/* Deterministic load validation — updates as courses are added/removed */}
        <Card className={cn(over && "ring-destructive/50")}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 font-semibold">
              {t("selectedLoad")}
              <VerifiedBadge />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="flex items-baseline gap-1.5">
              <span className={cn("text-3xl font-bold tabular-nums", over && "text-destructive")}>{num(load)}</span>
              <span className="text-sm text-muted-foreground">
                / {num(student.maxLoad)} {t("creditHours")}
              </span>
            </p>
            <Bar value={load} max={student.maxLoad} barClassName={over ? "bg-destructive" : "bg-verified"} label={t("selectedLoad")} />
            <p className={cn("flex items-center gap-1.5 text-sm font-medium", over ? "text-destructive" : "text-verified")} role="status">
              {over ? <XCircle className="size-4" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
              {over ? t("loadOver") : t("loadOk")}
            </p>
            <p className="text-xs text-muted-foreground">{tr(student.maxLoadRule)}</p>
            <SourceChip sourceId="load" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-semibold">
              <LockKeyhole className="size-4 text-muted-foreground" aria-hidden />
              {t("notEligible")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {ineligibleCourses.map((c) => (
                <li key={c.code} className="space-y-1.5 rounded-lg border border-dashed p-3">
                  <p className="text-sm font-medium">
                    {tr(c.name)} <Code className="text-xs text-muted-foreground">{c.code}</Code>
                  </p>
                  <p className="flex items-start gap-1.5 text-xs text-destructive">
                    <XCircle className="mt-px size-3.5 shrink-0" aria-hidden />
                    {tr(c.reason)}
                  </p>
                  <SourceChip sourceId={c.sourceId} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function CourseCard({ course: c, rank, added, onToggle }: { course: RecommendedCourse; rank: number; added: boolean; onToggle: () => void }) {
  const { t, tr, num } = useI18n()
  return (
    <li>
      <Card className={cn("transition-shadow", added && "ring-primary/40")}>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-start gap-3">
            <span
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold tabular-nums",
                rank === 1 ? "bg-highlight-soft text-highlight-ink" : "bg-muted text-muted-foreground"
              )}
              aria-label={`${t("rank")} ${rank}`}
            >
              {rank === 1 ? <Trophy className="size-5" aria-hidden /> : num(rank)}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="text-base font-semibold">{tr(c.name)}</h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Code>{c.code}</Code>
                <span>·</span>
                <span>
                  {num(c.credits)} {t("creditHours")}
                </span>
                <CategoryTag category={c.category} />
                {c.slot && <SlotTag slot={c.slot} />}
              </div>
            </div>
            <div className="w-28 space-y-1 text-end">
              <p className="text-xs text-muted-foreground">{t("priority")}</p>
              <p className="text-xl font-bold text-primary tabular-nums" aria-label={t("scoreOutOf")}>
                {num(c.priority)}
              </p>
              <Bar value={c.priority} className="h-1.5" label={t("priority")} />
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
            <div className="space-y-2 rounded-lg bg-verified-soft/50 p-3">
              <VerifiedBadge className="h-5 bg-transparent px-0" />
              <ul className="space-y-1.5">
                {c.verifiedReasons.map((r) => (
                  <li key={r.en} className="flex items-start gap-1.5 text-sm">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-verified" aria-hidden />
                    {tr(r)}
                  </li>
                ))}
              </ul>
            </div>
            {tr(c.aiReason) && <AiExplanation>{tr(c.aiReason)}</AiExplanation>}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              {c.unlocks.length > 0 && (
                <span className="flex flex-wrap items-center gap-1.5">
                  <Unlock className="size-3.5 text-primary" aria-hidden />
                  <span className="text-muted-foreground">
                    {t("unlocks")} {num(c.unlocks.length)} {t("coursesWord")}:
                  </span>
                  {c.unlocks.map((u) => (
                    <span key={u} className="rounded bg-muted px-1.5 py-0.5" title={tr(courseNames[u])}>
                      <Code>{u}</Code>
                    </span>
                  ))}
                </span>
              )}
              <span className="flex flex-wrap items-center gap-1.5" aria-label={t("sectionSeats")}>
                {c.sections.map((s) => (
                  <span
                    key={s.id}
                    className={cn(
                      "rounded px-1.5 py-0.5 tabular-nums",
                      s.seatsLeft === 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {t("section")} {num(Number(s.id))}: {s.seatsLeft === 0 ? t("full") : `${num(s.seatsLeft)} ${t("seats")}`}
                  </span>
                ))}
              </span>
            </div>
            <div className="flex gap-2">
              {c.sections.some((s) => s.seatsLeft === 0) && (
                <Button variant="outline" className="h-10">
                  {t("requestSeat")}
                </Button>
              )}
              <Button variant={added ? "secondary" : "default"} className="h-10 min-w-32 gap-1.5" aria-pressed={added} onClick={onToggle}>
                {added ? <Check className="size-4" /> : <Plus className="size-4" />}
                {added ? t("added") : t("addToPlan")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </li>
  )
}

// ------------------------------------------------------------------------------ Instructors

const prefSliders: { key: keyof StudentPrefs; label: DictKey; low: DictKey; high: DictKey }[] = [
  { key: "pace", label: "prefPace", low: "slow", high: "fast" },
  { key: "workload", label: "prefWorkload", low: "light", high: "heavy" },
  { key: "practical", label: "prefPractical", low: "theoretical", high: "practical" },
]

function InstructorsTab() {
  const { t, tr, num, lang } = useI18n()
  const view = useStudentView()
  const { insCourse: course, setInsCourse: setCourse, prefs, setPrefs, excluded, restoreInstructor } = useDemoState()
  // This term's proposed courses that have instructor data (else the first few courses that have any).
  const withData = useInstructorCourses()
  const proposed = view.proposedNow.filter((c) => withData.includes(c))
  const courseOptions = proposed.length ? proposed : withData.slice(0, 6)
  const firstOption = courseOptions[0]
  React.useEffect(() => {
    if (firstOption && !courseOptions.includes(course)) setCourse(firstOption)
  }, [firstOption, course, setCourse]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ranking from the AI service: by the surveys alone for a first-year student, with the student's own
  // grades once they have them, and with the sliders once the student moves them.
  const { items: ranked, basis, source, loading, excluded: removed } = useInstructorRanking(view.student.id, course, prefs, excluded)
  // "Best match" goes to the top score among instructors with at least medium confidence.
  const bestId = ranked.find((i) => i.conf !== "low")?.id
  const sep = lang === "ar" ? "، " : ", "

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="font-semibold">{t("forCourse")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2" role="radiogroup" aria-label={t("forCourse")}>
              {courseOptions.map((code) => (
                <button
                  key={code}
                  type="button"
                  role="radio"
                  aria-checked={course === code}
                  onClick={() => setCourse(code)}
                  className={cn(
                    "flex h-11 items-center justify-between rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    course === code ? "border-primary bg-primary/8 text-foreground" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {tr(courseNames[code])}
                  <Code className="text-xs">{code}</Code>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-semibold">{t("yourPreferences")}</CardTitle>
            <CardDescription>{t("prefsHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {prefSliders.map((s) => (
              <div key={s.key} className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span id={`pref-${s.key}`} className="font-medium">
                    {t(s.label)}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{num(prefs[s.key])}</span>
                </div>
                <Slider
                  aria-labelledby={`pref-${s.key}`}
                  value={[prefs[s.key]]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={(v) => setPrefs((p) => ({ ...p, [s.key]: Array.isArray(v) ? v[0] : (v as number) }))}
                  className="**:data-[slot=slider-thumb]:size-4"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>{t(s.low)}</span>
                  <span>{t(s.high)}</span>
                </div>
              </div>
            ))}
            <p className="flex items-start gap-1.5 rounded-lg bg-warning-soft p-2.5 text-xs text-warning">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
              {t("demoScoring")}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
        <span>{t("rankingBasis")}:</span>
        <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">{tr(basisText[basis])}</span>
        {source === "demo" && <span className="text-warning">{t("offlineRanking")}</span>}
      </p>
      {removed.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs">
          <span className="text-muted-foreground">{t("removedByYou")}:</span>
          {removed.map((r) => (
            <span key={r.key} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5">
              {tr(r.name)}
              <button
                type="button"
                onClick={() => restoreInstructor(r.key)}
                className="font-medium text-primary underline-offset-2 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {t("bringBack")}
              </button>
            </span>
          ))}
        </div>
      )}
      {ranked.length === 0 && !loading && removed.length > 0 && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium text-warning">{t("allRemoved")}</p>
      )}
      <ol className={cn("space-y-3 transition-opacity", loading && "opacity-60")}>
        {ranked.map((ins) => (
          <li key={ins.id}>
            <Card className={cn(ins.id === bestId && "ring-primary/50")}>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-full bg-secondary font-bold text-secondary-foreground">
                      {tr(ins.name).replace(/^(د\.|Dr\.)\s*/, "").charAt(0)}
                    </span>
                    <div>
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        {tr(ins.name)}
                        {ins.id === bestId && (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">{t("bestMatch")}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("section")} {num(Number(ins.section))}
                      </p>
                    </div>
                  </div>
                  <div className="text-end">
                    <p className="text-3xl font-bold text-primary tabular-nums">{num(ins.score)}%</p>
                    <p className="text-xs text-muted-foreground">{t("compatibility")}</p>
                  </div>
                </div>

                <ConfidenceMeter level={ins.conf} responses={ins.responses} />

                <ProfileBars profile={ins.profile} prefs={prefs} />

                {ins.reasons.length > 0 && <AiExplanation>{ins.reasons.map((r) => tr(r)).join(sep)}</AiExplanation>}

                {ins.conf === "low" && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
                    <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                    {t("limitedData")}
                  </p>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
      </div>
    </div>
  )
}

/** Survey-derived teaching profile, with the student's preference marked where one exists. */
function ProfileBars({ profile, prefs }: { profile: TeachingProfile; prefs: StudentPrefs }) {
  const { t, tr, num } = useI18n()
  const prefFor: Partial<Record<keyof TeachingProfile, number>> = {
    pace: prefs.pace,
    workload: prefs.workload,
    practical: prefs.practical,
  }
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-3 sm:grid-cols-2">
      {(Object.keys(dimensionLabels) as (keyof TeachingProfile)[]).map((k) => {
        const pref = prefFor[k]
        return (
          <div key={k} className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <dt className="text-muted-foreground">{tr(dimensionLabels[k])}</dt>
              <dd className="font-medium tabular-nums">{num(profile[k])}</dd>
            </div>
            <div className="relative">
              <Bar value={profile[k]} className="h-1.5" barClassName="bg-chart-2" label={tr(dimensionLabels[k])} />
              {pref !== undefined && (
                <span
                  className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-full bg-foreground"
                  style={{ insetInlineStart: `calc(${pref}% - 1px)` }}
                  title={`${t("youPrefer")}: ${pref}`}
                  aria-hidden
                />
              )}
            </div>
          </div>
        )
      })}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground sm:col-span-2">
        <span className="h-3 w-0.5 rounded-full bg-foreground" aria-hidden />
        {t("youPrefer")}
      </div>
    </dl>
  )
}
