"use client"

import * as React from "react"
import { AlertTriangle, BookOpen, Cake, CalendarDays, Info, Users } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Code, PageHeader } from "@/components/masari/bits"
import { type TeachingAssistant, useTeachingAssistants } from "@/lib/data/assistants-source"
import { useStudentView } from "@/lib/student-context"
import { type DictKey, type L, useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * Recommendations are about teaching assistants only (the team dropped ranking doctors): this term's registered
 * courses that have more than one teaching assistant, with facts about each so the student chooses.
 */
export default function RecommendationsPage() {
  const { t } = useI18n()
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <PageHeader title={t("recTitle")} subtitle={t("recSubtitle")} />
      <AssistantsTab />
    </div>
  )
}

// ------------------------------------------------------------------------------ Teaching assistants

/** "First time" / "3rd time" teaching this course. */
function timesText(n: number): L {
  const ar = ["", "أول مرة", "المرة التانية", "المرة التالتة", "المرة الرابعة", "المرة الخامسة", "المرة السادسة"]
  const suffix = n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"
  return { ar: ar[n] ?? `المرة رقم ${n}`, en: n === 1 ? "First time" : `${n}${suffix} time` }
}

function AssistantsTab() {
  const { t, tr } = useI18n()
  const { student } = useStudentView()
  const { courses, status } = useTeachingAssistants(student.id)
  const [picked, setPicked] = React.useState("")
  const course = courses.find((c) => c.code === picked) ?? courses[0]

  if (status !== "ready" || !course)
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center" role="status">
          {status === "error" ? (
            <AlertTriangle className="size-8 text-warning" aria-hidden />
          ) : (
            <Users className="size-8 text-muted-foreground" aria-hidden />
          )}
          <p className="text-base font-semibold">
            {status === "loading" ? t("loadingAssistants") : status === "error" ? t("assistantsUnavailable") : t("noRecommendations")}
          </p>
          {status === "ready" && <p className="max-w-md text-sm text-muted-foreground">{t("noRecommendationsHint")}</p>}
        </CardContent>
      </Card>
    )

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="lg:sticky lg:top-20 lg:self-start">
        <CardHeader>
          <CardTitle className="font-semibold">{t("forCourse")}</CardTitle>
          <CardDescription>{t("assistantCoursesHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2" role="radiogroup" aria-label={t("forCourse")}>
            {courses.map((c) => (
              <button
                key={c.code}
                type="button"
                role="radio"
                aria-checked={course.code === c.code}
                onClick={() => setPicked(c.code)}
                className={cn(
                  "flex h-11 items-center justify-between gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  course.code === c.code ? "border-primary bg-primary/8 text-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <span className="truncate">{tr(c.name)}</span>
                <Code className="shrink-0 text-xs">{c.code}</Code>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          {t("assistantsNote")}
        </p>
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
          {course.assistants.map((a) => (
            <li key={a.id}>
              <AssistantCard assistant={a} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function AssistantCard({ assistant: a }: { assistant: TeachingAssistant }) {
  const { t, tr, num } = useI18n()
  const facts: { label: DictKey; value: string; icon: typeof Cake }[] = [
    { label: "taAge", value: `${num(a.age)} ${t("years")}`, icon: Cake },
    { label: "taAppointed", value: num(a.appointedYear, { useGrouping: false }), icon: CalendarDays },
    { label: "taTimesTaught", value: tr(timesText(a.timesTaught)), icon: BookOpen },
  ]
  return (
    <Card className="h-full">
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary font-bold text-secondary-foreground">
            {tr(a.name).replace(/^(م\.|Eng\.)\s*/, "").charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{tr(a.name)}</p>
            <p className="text-xs text-muted-foreground">
              {t("taPeriod")} {num(a.period)}
            </p>
          </div>
        </div>
        <dl className="divide-y rounded-lg border">
          {facts.map((f) => (
            <div key={f.label} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <f.icon className="size-4" aria-hidden />
                {t(f.label)}
              </dt>
              <dd className="font-medium tabular-nums">{f.value}</dd>
            </div>
          ))}
        </dl>
        {a.timesTaught === 1 && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{t("taFirstTimeNote")}</p>
        )}
      </CardContent>
    </Card>
  )
}
