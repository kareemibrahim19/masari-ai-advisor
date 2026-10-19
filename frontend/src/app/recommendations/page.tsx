"use client"

import * as React from "react"
import { AlertTriangle, CalendarClock, Check, GraduationCap, Info, Users } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Code, PageHeader } from "@/components/masari/bits"
import { GradeChart } from "@/components/masari/grade-chart"
import { PriorityLevel } from "@/components/masari/priority-level"
import { type GradingStyle, type RankedInstructor, useInstructorRecommendations } from "@/lib/data/instructor-grades-source"
import { useGraduationDelays } from "@/lib/graduation-delays"
import { priorityLevel } from "@/lib/rules"
import { useStudentView } from "@/lib/student-context"
import { rankCurrentCourses } from "@/lib/student-view"
import { type DictKey, type L, useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** One colour per instructor, in the order of the cards (validated categorical slots, see globals.css). */
const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)"]

const styleClass: Record<GradingStyle, string> = {
  lenient: "bg-verified-soft text-verified",
  balanced: "bg-secondary text-secondary-foreground",
  strict: "bg-warning-soft text-warning",
}

/**
 * This term's courses, each with the instructor teaching it and how students did with them (the AI service's grading
 * model), the course's last 10 years compared with previous instructors, and the course's priority in the graduation
 * plan: a high-priority course is registered this term even when the average is lower.
 */
export default function RecommendationsPage() {
  const { t } = useI18n()
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <PageHeader title={t("recTitle")} subtitle={t("recSubtitle")} />
      <InstructorsTab />
    </div>
  )
}

/** What to do, given the course's priority and the instructor's grade record (same rules as the chat tool's `advice`). */
function adviceFor(level: "high" | "medium" | "normal", ins: RankedInstructor): { key: DictKey; tone: "high" | "soft" } | null {
  const low = ins.style === "strict"
  if (level === "high") return { key: low ? "adviceOneHighLow" : "adviceOneHigh", tone: "high" }
  return low ? { key: "adviceOneLow", tone: "soft" } : null
}

function InstructorsTab() {
  const { t, tr } = useI18n()
  const { student, currentCourses } = useStudentView()
  const { courses, status } = useInstructorRecommendations(student.id)
  const delays = useGraduationDelays(student.id)
  // The same priority as the dashboard's "this term" list.
  const priority = React.useMemo(
    () => new Map(rankCurrentCourses(currentCourses, delays).map((c) => [c.code, c.priority])),
    [currentCourses, delays]
  )
  const ordered = React.useMemo(
    () => [...courses].sort((a, b) => (priority.get(b.code) ?? 0) - (priority.get(a.code) ?? 0)),
    [courses, priority]
  )
  const [picked, setPicked] = React.useState("")
  const course = ordered.find((c) => c.code === picked) ?? ordered[0]

  if (status !== "ready" || !course)
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center" role="status">
          {status === "error" ? <AlertTriangle className="size-8 text-warning" aria-hidden /> : <Users className="size-8 text-muted-foreground" aria-hidden />}
          <p className="text-base font-semibold">
            {status === "loading" ? t("loadingInstructors") : status === "error" ? t("instructorsUnavailable") : t("noRecommendations")}
          </p>
          {status === "ready" && <p className="max-w-md text-sm text-muted-foreground">{t("noRecommendationsHint")}</p>}
        </CardContent>
      </Card>
    )

  const score = priority.get(course.code) ?? 0
  const level = priorityLevel(score)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="lg:sticky lg:top-20 lg:self-start">
        <CardHeader>
          <CardTitle className="font-semibold">{t("forCourse")}</CardTitle>
          <CardDescription>{t("instructorCoursesHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2" role="radiogroup" aria-label={t("forCourse")}>
            {ordered.map((c) => (
              <button
                key={c.code}
                type="button"
                role="radio"
                aria-checked={course.code === c.code}
                onClick={() => setPicked(c.code)}
                className={cn(
                  "flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-start text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  course.code === c.code ? "border-primary bg-primary/8 text-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate">{tr(c.name)}</span>
                  <Code className="text-xs">{c.code}</Code>
                </span>
                <PriorityLevel score={priority.get(c.code) ?? 0} className="shrink-0" />
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div
          className={cn(
            "flex items-start gap-2 rounded-xl px-4 py-3 text-sm",
            level === "high" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
          )}
        >
          <GraduationCap className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">{tr(course.name)}: </span>
            {t(level === "high" ? "coursePriorityHigh" : level === "medium" ? "coursePriorityMedium" : "coursePriorityNormal")}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-semibold">{t("gradesChartTitle")}</CardTitle>
            <CardDescription>{t("gradesChartDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <GradeChart history={course.history} current={course.instructors.slice(0, 3).map((x, i) => ({ id: x.id, color: SERIES[i] }))} />
          </CardContent>
        </Card>

        <h2 className="text-sm font-semibold">{t("instructorThisTerm")}</h2>
        <ol className="grid grid-cols-[minmax(0,1fr)] gap-3">
          {course.instructors.map((ins, i) => (
            <li key={ins.id}>
              <InstructorCard ins={ins} color={SERIES[i]} advice={adviceFor(level, ins)} />
            </li>
          ))}
        </ol>

        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          {t("gradesDemoNote")}
        </p>
      </div>
    </div>
  )
}

function InstructorCard({
  ins,
  color,
  advice,
}: {
  ins: RankedInstructor
  color?: string
  advice: { key: DictKey; tone: "high" | "soft" } | null
}) {
  const { t, tr, num } = useI18n()
  const pct = (v: number) => `${num(Math.round(v * 100))}%`
  const stats: { label: DictKey; value: string; words?: boolean }[] = [
    { label: "statMean", value: num(Math.round(ins.mean)) },
    { label: "passRate", value: pct(ins.passRate) },
    { label: "statARate", value: pct(ins.aRate) },
    ...(ins.courseworkMax
      ? [{ label: "statCoursework" as DictKey, value: `${num(Math.round(ins.coursework))} ${t("outOf")} ${num(ins.courseworkMax)}`, words: true }]
      : []),
  ]
  return (
    <Card className="h-full">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-secondary font-bold text-secondary-foreground">
              {tr(ins.name).replace(/^(د\.|Dr\.)\s*/, "").charAt(0)}
              {color && <span className="absolute -end-0.5 -bottom-0.5 size-3.5 rounded-full ring-2 ring-card" style={{ background: color }} aria-hidden />}
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {tr(ins.name)}
              </p>
              <p className="text-xs text-muted-foreground">
                {ins.firstTime
                  ? t("firstTimeTeaching")
                  : `${t("taughtFor")} ${num(ins.yearsTaught)} ${t("yearsWord")} · ${num(ins.students)} ${t("studentsWord")}`}
              </p>
            </div>
          </div>
          {ins.expected !== null && (
            <div className="text-end">
              <p className="text-3xl font-bold text-primary tabular-nums">{num(Math.round(ins.expected))}</p>
              <p className="text-xs text-muted-foreground">{t("expectedForYou")}</p>
            </div>
          )}
        </div>

        {ins.style && ins.styleLabel && (
          <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium", styleClass[ins.style])}>{tr(ins.styleLabel)}</span>
        )}

        {!ins.firstTime && (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg bg-muted/60 px-2.5 py-2">
                <dt className="text-[11px] text-muted-foreground">{t(s.label)}</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  <span dir={s.words ? undefined : "ltr"}>{s.value}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}

        <ul className="space-y-1.5">
          {ins.reasons.map((r: L) => (
            <li key={r.en} className="flex items-start gap-1.5 text-sm">
              <Check className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              {tr(r)}
            </li>
          ))}
        </ul>

        {advice && (
          <p
            className={cn(
              "flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs font-medium",
              advice.tone === "high" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
            )}
          >
            <CalendarClock className="mt-px size-3.5 shrink-0" aria-hidden />
            {t(advice.key)}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
