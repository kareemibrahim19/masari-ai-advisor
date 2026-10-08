"use client"

import * as React from "react"
import { CalendarClock, CheckCircle2, GraduationCap, History, Info, MoveRight, TriangleAlert, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Bar, CategoryTag, Code, PageHeader, SlotTag } from "@/components/masari/bits"
import { AiExplanation, SourceChip, VerifiedBadge } from "@/components/masari/trust"
import {
  baselineGraduationIndex,
  baselinePlan,
  courseNames,
  minLoad,
  planAssumption,
  scenarios,
  semesterNames,
  student,
  type PlannedCourse,
} from "@/lib/mock-data"
import { useDemoState } from "@/lib/demo-state"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const verdictStyle = {
  delay: { icon: CalendarClock, cls: "bg-warning-soft text-warning" },
  same: { icon: CheckCircle2, cls: "bg-verified-soft text-verified" },
  infeasible: { icon: XCircle, cls: "bg-destructive/10 text-destructive" },
} as const

const indexOf = (plan: PlannedCourse[][]) => new Map(plan.flatMap((t, i) => t.map((c) => [c.code, i] as const)))

export default function PlanPage() {
  const { t, tr, num } = useI18n()
  const { scenarioId, setScenarioId } = useDemoState()
  const scenario = scenarios.find((s) => s.id === scenarioId) ?? null

  const plan = scenario?.plan ?? baselinePlan
  const gradIdx = scenario && scenario.graduationIndex >= 0 ? scenario.graduationIndex : baselineGraduationIndex
  const lastIdx = Math.max(gradIdx, plan.findLastIndex((x) => x.length > 0))
  const visible = plan.slice(0, lastIdx + 1)
  const baseIndex = indexOf(baselinePlan)

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <PageHeader
        title={t("planTitle")}
        subtitle={t("planSubtitle")}
        actions={
          <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-2.5">
            <GraduationCap className="size-5 text-primary" aria-hidden />
            <div>
              <p className="text-xs text-muted-foreground">{t("estGraduation")}</p>
              <p className="text-sm font-semibold">{scenario ? tr(scenario.graduation) : tr(student.estGraduation)}</p>
            </div>
          </div>
        }
      />

      {/* What-if */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{t("whatIf")}</CardTitle>
          <CardDescription>{t("whatIfDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("scenario")}>
            {scenarios.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={scenarioId === s.id}
                onClick={() => setScenarioId(s.id)}
                className={cn(
                  "min-h-11 rounded-xl border px-4 py-2 text-start text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
                  scenarioId === s.id ? "border-primary bg-primary/8" : "hover:bg-muted"
                )}
              >
                {tr(s.label)}
              </button>
            ))}
            {scenario && (
              <Button variant="ghost" className="h-11 gap-1.5" onClick={() => setScenarioId(null)}>
                <History className="size-4" />
                {t("reset")}
              </Button>
            )}
          </div>

          {scenario && <ScenarioResult key={scenario.id} scenarioId={scenario.id} />}
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        {tr(planAssumption)}
      </p>

      {/* Semester timeline */}
      <section
        aria-label={t("planTitle")}
        className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]"
      >
        {visible.map((sem, i) => {
          const load = sem.reduce((s, c) => s + c.credits, 0)
          const over = load > student.maxLoad
          // Below the 12-credit minimum is only allowed in the graduation term (or with Academic Council approval).
          const under = sem.length > 0 && load < minLoad && i !== gradIdx
          const extra = i > baselineGraduationIndex
          return (
            <Card key={i} className={cn(extra && "ring-warning/60", sem.length === 0 && "bg-muted/40")}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 font-semibold">
                  {tr(semesterNames[i])}
                  {i === gradIdx && <GraduationCap className="size-4 text-primary" aria-label={t("estGraduation")} />}
                </CardTitle>
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{t("semesterLoad")}</span>
                    <span className={cn("font-medium tabular-nums", over && "text-destructive", under && "text-warning")}>
                      {num(load)}/{num(student.maxLoad)}
                    </span>
                  </div>
                  <Bar
                    value={load}
                    max={student.maxLoad}
                    className="h-1.5"
                    barClassName={over ? "bg-destructive" : under ? "bg-warning" : undefined}
                    label={t("semesterLoad")}
                  />
                  {under && (
                    <p className="flex items-start gap-1 pt-1 text-[11px] text-warning">
                      <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden />
                      {t("underMinLoad")}
                    </p>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {sem.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("noCoursesThisTerm")}</p>
                ) : (
                  <ul className="space-y-2">
                    {sem.map((c) => {
                      const from = baseIndex.get(c.code) ?? i
                      const moved = !!scenario && from !== i
                      const later = i > from
                      return (
                        <li
                          key={c.code}
                          className={cn(
                            "space-y-1.5 rounded-lg border bg-background/60 p-2.5 transition-colors",
                            moved && "border-warning/60 bg-warning-soft/60"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm leading-snug font-medium">{tr(courseNames[c.code])}</p>
                            {moved && (
                              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-warning">
                                <MoveRight className={cn("size-3", later ? "rtl:rotate-180" : "ltr:rotate-180")} aria-hidden />
                                {later ? t("delayed") : t("movedEarlier")}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Code>{c.code}</Code>
                            <span>
                              · {num(c.credits)} {t("creditsShort")}
                            </span>
                            <CategoryTag category={c.category} className="h-[18px] px-1.5 text-[10px]" />
                            {c.slot && <SlotTag slot={c.slot} className="h-[18px] px-1.5 text-[10px]" />}
                          </div>
                          {(c.requires.length > 0 || c.minCredits) && (
                            <p className="text-[11px] text-muted-foreground">
                              {t("requires")}:{" "}
                              {c.requires.map((r, idx) => (
                                <React.Fragment key={r}>
                                  {idx > 0 && "، "}
                                  <Code>{r}</Code>
                                </React.Fragment>
                              ))}
                              {c.minCredits ? (
                                <span className="tabular-nums">
                                  ≥ {num(c.minCredits)} {t("creditsShort")}
                                </span>
                              ) : null}
                            </p>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          )
        })}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <VerifiedBadge />
        <SourceChip sourceId="catalog" />
        <SourceChip sourceId="load" />
        <SourceChip sourceId="training" />
      </div>
    </div>
  )
}

function ScenarioResult({ scenarioId }: { scenarioId: string }) {
  const { t, tr, num } = useI18n()
  const s = scenarios.find((x) => x.id === scenarioId)!
  const v = verdictStyle[s.verdict]
  const Icon = v.icon

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
      <div className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <VerifiedBadge />
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", v.cls)}>
            <Icon className="size-3.5" aria-hidden />
            {tr(s.graduation)}
          </span>
        </div>
        <p className="flex items-start gap-1.5 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <bdi>{tr(s.ruleNote)}</bdi>
        </p>
        {s.affected.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {t("affected")} ({num(s.affected.length)})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {s.affected.map((code) => (
                <span key={code} className="rounded-md bg-warning-soft px-2 py-0.5 text-xs text-warning">
                  <Code>{code}</Code>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <AiExplanation>{tr(s.summary)}</AiExplanation>
    </div>
  )
}
