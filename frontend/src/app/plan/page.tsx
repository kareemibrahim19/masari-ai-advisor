"use client"

import * as React from "react"
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  GraduationCap,
  History,
  Info,
  LoaderCircle,
  MoveRight,
  RotateCw,
  Sun,
  TriangleAlert,
  X,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Bar, Code, PageHeader } from "@/components/masari/bits"
import { SourceChip, VerifiedBadge } from "@/components/masari/trust"
import { courseNames } from "@/lib/demo-content"
import { useI18n } from "@/lib/i18n"
import {
  fetchPlan,
  PlanError,
  type GraduationPlan,
  type PlanCourse,
  type PlanFlag,
  type PlanResponse,
  type PlanTerm,
  type TargetYears,
} from "@/lib/plan-api"
import { useStudentView } from "@/lib/student-context"
import { cn } from "@/lib/utils"

const TARGETS: { years: TargetYears; key: "years4" | "years45" | "years5" }[] = [
  { years: 4, key: "years4" },
  { years: 4.5, key: "years45" },
  { years: 5, key: "years5" },
]

const flagStyle: Record<Exclude<PlanFlag, "regular">, { key: Parameters<ReturnType<typeof useI18n>["t"]>[0]; cls: string }> = {
  summer_on_demand: { key: "flagSummer", cls: "bg-warning-soft text-warning" },
  training_summer: { key: "flagTrainingSummer", cls: "bg-muted text-muted-foreground" },
  college_request: { key: "flagCollegeRequest", cls: "bg-primary/10 text-primary" },
  graduation_request: { key: "flagGraduationRequest", cls: "bg-primary/10 text-primary" },
}

/** Order of terms in time: academic year, then fall < spring < summer. */
const termOrder = (t: { academic_year: string; term: string }) =>
  parseInt(t.academic_year, 10) * 3 + ({ fall: 0, spring: 1, summer: 2 } as Record<string, number>)[t.term]

const lastTermOrder = (p: GraduationPlan) => (p.terms.length ? termOrder(p.terms[p.terms.length - 1]) : -1)

/** A typed term GPA, or null while the field is empty / not a number between 0 and 4. */
function parseGpa(text: string): number | null {
  const v = Number(text.trim().replace(",", "."))
  return text.trim() !== "" && Number.isFinite(v) && v >= 0 && v <= 4 ? v : null
}

export default function PlanPage() {
  const { t, tr, num } = useI18n()
  const { student } = useStudentView()

  const [target, setTarget] = React.useState<TargetYears>(5)
  const [allowSummer, setAllowSummer] = React.useState(true)
  const [failed, setFailed] = React.useState<string[]>([])
  const [gpaText, setGpaText] = React.useState("")
  const [gpa, setGpa] = React.useState<number | null>(null)

  const [data, setData] = React.useState<PlanResponse | null>(null)
  // The request the shown result (or error) belongs to; while it differs from the current one we are loading.
  const [settledKey, setSettledKey] = React.useState("")
  const [error, setError] = React.useState<PlanError | Error | null>(null)
  const [attempt, setAttempt] = React.useState(0)

  // Wait for the student to stop typing before asking for a new plan.
  React.useEffect(() => {
    const id = setTimeout(() => setGpa(parseGpa(gpaText)), 400)
    return () => clearTimeout(id)
  }, [gpaText])

  const query = React.useMemo(
    () => ({ studentId: student.id, targetYears: target, allowSummer, failedCourses: failed, expectedTermGpa: gpa }),
    [student.id, target, allowSummer, failed, gpa]
  )
  const key = `${JSON.stringify(query)}#${attempt}`
  const loading = settledKey !== key

  React.useEffect(() => {
    const controller = new AbortController()
    fetchPlan(query, controller.signal)
      .then((d) => {
        setData(d)
        setError(null)
        setSettledKey(key)
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return
        setError(e)
        setSettledKey(key)
      })
    return () => controller.abort()
  }, [query, key])

  const plan = data?.plan
  const baseline = data?.baseline ?? null
  const inputRejected = error instanceof PlanError && error.status === 400
  const gpaInvalid = gpaText.trim() !== "" && parseGpa(gpaText) === null
  const whatIfActive = failed.length > 0 || gpa !== null

  const baseOrder = React.useMemo(() => {
    const m = new Map<string, number>()
    baseline?.terms.forEach((term) => term.courses.forEach((c) => m.set(c.code, termOrder(term))))
    return m
  }, [baseline])

  const resetWhatIf = () => {
    setFailed([])
    setGpaText("")
    setGpa(null)
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <PageHeader
        title={t("planTitle")}
        subtitle={t("planSubtitle")}
        actions={
          plan && (
            <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-2.5">
              <GraduationCap className="size-5 text-primary" aria-hidden />
              <div>
                <p className="text-xs text-muted-foreground">{t("estGraduation")}</p>
                <p className="text-sm font-semibold">{plan.graduation_term ? tr(plan.graduation_term) : "—"}</p>
              </div>
            </div>
          )
        }
      />

      {/* Target + summer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{t("gradTarget")}</CardTitle>
          <CardDescription>{t("gradTargetDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("gradTarget")}>
            {TARGETS.map(({ years, key }) => {
              const opt = data?.options.find((o) => o.target_years === years)
              const cell = opt && (allowSummer ? opt.with_summer : opt.without_summer)
              return (
                <button
                  key={years}
                  type="button"
                  role="radio"
                  aria-checked={target === years}
                  onClick={() => setTarget(years)}
                  className={cn(
                    "min-h-16 space-y-1 rounded-xl border px-3 py-2.5 text-start transition-colors focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
                    target === years ? "border-primary bg-primary/8" : "hover:bg-muted"
                  )}
                >
                  <span className="block text-sm font-semibold">{t(key)}</span>
                  {years === 5 && <span className="block text-[11px] text-muted-foreground">{t("regulationPlan")}</span>}
                  {cell && (
                    <span
                      className={cn(
                        "flex items-start gap-1 text-[11px] leading-snug font-medium",
                        cell.feasible ? "text-verified" : "text-muted-foreground"
                      )}
                    >
                      {cell.feasible ? <CheckCircle2 className="mt-px size-3 shrink-0" aria-hidden /> : <XCircle className="mt-px size-3 shrink-0" aria-hidden />}
                      <span>
                        {cell.feasible ? t("possible") : t("notPossible")}
                        {cell.feasible && cell.summer_courses > 0 && ` · ${num(cell.summer_courses)} ${t("summerCoursesCount")}`}
                      </span>
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <label className="flex items-start gap-3 rounded-xl border p-3">
            <Switch checked={allowSummer} onCheckedChange={setAllowSummer} className="mt-0.5" />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">{t("allowSummer")}</span>
              <span className="block text-xs text-muted-foreground">{t("allowSummerHint")}</span>
            </span>
          </label>
        </CardContent>
      </Card>

      {/* What-if */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{t("whatIf")}</CardTitle>
          <CardDescription>{t("whatIfDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
            <FailedPicker courses={student.registeredNow} selected={failed} onChange={setFailed} />
            <div className="space-y-1.5">
              <label htmlFor="term-gpa" className="text-sm font-medium">
                {t("termGpaLabel")}
              </label>
              <Input
                id="term-gpa"
                inputMode="decimal"
                dir="ltr"
                placeholder={t("termGpaPlaceholder")}
                value={gpaText}
                onChange={(e) => setGpaText(e.target.value)}
                aria-invalid={gpaInvalid || inputRejected}
                aria-describedby="term-gpa-hint"
                className="h-11 max-w-40 tabular-nums"
              />
              <p id="term-gpa-hint" className={cn("text-xs", gpaInvalid || inputRejected ? "text-destructive" : "text-muted-foreground")}>
                {inputRejected ? error?.message : t("termGpaHint")}
              </p>
            </div>
          </div>

          {whatIfActive && (
            <Button variant="ghost" className="h-11 gap-1.5" onClick={resetWhatIf}>
              <History className="size-4" />
              {t("reset")}
            </Button>
          )}

          {plan && whatIfActive && <WhatIfResult plan={plan} baseline={baseline} />}
        </CardContent>
      </Card>

      {/* Result */}
      {error && !inputRejected && !loading ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-6">
            <p className="flex items-start gap-2 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              {t("planServiceDown")}
            </p>
            <Button variant="outline" className="h-11 gap-1.5" onClick={() => setAttempt((n) => n + 1)}>
              <RotateCw className="size-4" />
              {t("retry")}
            </Button>
          </CardContent>
        </Card>
      ) : !plan ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {t("planLoading")}
        </p>
      ) : (
        <div className={cn("space-y-4 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
          <PlanSummary plan={plan} />

          {plan.terms.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("graduateThisTerm")}</p>
          ) : (
            <section
              aria-label={t("planTitle")}
              className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]"
            >
              {plan.terms.map((term, i) => (
                <TermCard
                  key={`${term.academic_year}-${term.term}`}
                  term={term}
                  isGraduation={i === plan.terms.length - 1}
                  movedFrom={whatIfActive ? baseOrder : null}
                />
              ))}
            </section>
          )}

          <Legend />

          <div className="flex flex-wrap items-center gap-2">
            <VerifiedBadge />
            <SourceChip sourceId="catalog" />
            <SourceChip sourceId="load" />
            <SourceChip sourceId="training" />
          </div>
        </div>
      )}
    </div>
  )
}

function FailedPicker({ courses, selected, onChange }: { courses: string[]; selected: string[]; onChange: (codes: string[]) => void }) {
  const { t, tr, num } = useI18n()
  const name = (code: string) => (courseNames[code] ? tr(courseNames[code]) : code)
  const toggle = (code: string, on: boolean) =>
    onChange(on ? [...selected, code].filter((c, i, a) => a.indexOf(c) === i) : selected.filter((c) => c !== code))

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium" id="failed-label">
        {t("ifIFail")}
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" className="h-11 w-full justify-between font-normal" aria-labelledby="failed-label" />
          }
        >
          <span className={cn("truncate", !selected.length && "text-muted-foreground")}>
            {selected.length
              ? tr(
                  selected.length === 1
                    ? { ar: "مادة واحدة مختارة", en: "1 course selected" }
                    : { ar: `${num(selected.length)} مواد مختارة`, en: `${num(selected.length)} courses selected` }
                )
              : t("pickCourses")}
          </span>
          <ChevronDown className="size-4 opacity-60" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-64">
          {courses.map((code) => (
            <DropdownMenuCheckboxItem
              key={code}
              checked={selected.includes(code)}
              onCheckedChange={(on) => toggle(code, on)}
              className="min-h-10"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{name(code)}</span>
                <Code className="text-[11px] text-muted-foreground">{code}</Code>
              </span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((code) => (
            <li key={code}>
              <button
                type="button"
                onClick={() => toggle(code, false)}
                className="inline-flex min-h-8 items-center gap-1 rounded-md bg-destructive/10 px-2 text-xs text-destructive focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`${name(code)} ×`}
              >
                <Code>{code}</Code>
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{t("ifIFailHint")}</p>
      )}
    </div>
  )
}

function WhatIfResult({ plan, baseline }: { plan: GraduationPlan; baseline: GraduationPlan | null }) {
  const { t, tr, num } = useI18n()
  const a = plan.after_this_term
  const delayed = baseline ? lastTermOrder(plan) > lastTermOrder(baseline) : false
  const Icon = delayed ? CalendarClock : CheckCircle2

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-xl border p-4 md:grid-cols-2">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("afterThisTerm")}</p>
        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/60 p-2.5">
            <dt className="text-[11px] text-muted-foreground">{t("cumulativeGpa")}</dt>
            <dd className="text-lg font-semibold tabular-nums">{a.cumulative_gpa === null ? "—" : num(a.cumulative_gpa, { minimumFractionDigits: 2 })}</dd>
          </div>
          <div className="rounded-lg bg-muted/60 p-2.5">
            <dt className="text-[11px] text-muted-foreground">{t("creditCap")}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {num(a.max_credits)} {t("creditsShort")}
              {a.cumulative_gpa !== null && a.cumulative_gpa < 2 && (
                <span className="ms-1.5 text-xs font-medium text-destructive">{t("probationCap")}</span>
              )}
            </dd>
          </div>
        </dl>
      </div>
      {baseline && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("comparedToPlan")}</p>
          <p
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
              delayed ? "bg-warning-soft text-warning" : "bg-verified-soft text-verified"
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {delayed ? t("graduationMoves") : t("sameGraduation")}
          </p>
          {delayed && baseline.graduation_term && plan.graduation_term && (
            <p className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-muted-foreground line-through">{tr(baseline.graduation_term)}</span>
              <MoveRight className="size-4 rtl:rotate-180" aria-hidden />
              <span className="font-semibold">{tr(plan.graduation_term)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function PlanSummary({ plan }: { plan: GraduationPlan }) {
  const { t, tr, num, lang } = useI18n()
  const target = t(TARGETS.find((x) => x.years === plan.target_years)!.key)
  const grad = plan.graduation_term ? tr(plan.graduation_term) : "—"
  const summer = plan.summer_courses?.length ?? 0
  const requests = plan.college_requests?.length ?? 0

  let text: string
  if (plan.feasible) {
    text = lang === "ar" ? `تقدر تتخرج في ${grad} (هدف ${target}).` : `You can graduate in ${grad} (${target} target).`
  } else if (plan.reason_code === "past") {
    text =
      lang === "ar"
        ? `هدف ${target} عدّى: انت في الترم الأساسي رقم ${plan.current_main_semester}. أقرب تخرج: ${grad}.`
        : `The ${target} target has passed: you are in main semester ${plan.current_main_semester}. Earliest graduation: ${grad}.`
  } else {
    text =
      lang === "ar"
        ? `هدف ${target} مش ممكن بالقواعد (المتطلبات، ترم كل مادة، حد الساعات${plan.allow_summer ? "، والصيفي" : ""}). أقرب تخرج: ${grad}.`
        : `The ${target} target is not possible under the rules (prerequisites, course terms, credit limits${plan.allow_summer ? ", summer" : ""}). Earliest graduation: ${grad}.`
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between",
        plan.feasible ? "border-verified/30 bg-verified-soft/50" : "border-warning/40 bg-warning-soft/50"
      )}
    >
      <p className="flex items-start gap-2 text-sm font-medium">
        {plan.feasible ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-verified" aria-hidden />
        ) : (
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        )}
        <span>{text}</span>
      </p>
      <div className="flex shrink-0 flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-background px-2.5 py-1">
          {t("summerCoursesCount")}: <span className="font-semibold tabular-nums">{num(summer)}</span>
        </span>
        <span className="rounded-full bg-background px-2.5 py-1">
          {t("collegeRequestsCount")}: <span className="font-semibold tabular-nums">{num(requests)}</span>
        </span>
      </div>
    </div>
  )
}

function TermCard({ term, isGraduation, movedFrom }: { term: PlanTerm; isGraduation: boolean; movedFrom: Map<string, number> | null }) {
  const { t, tr, num } = useI18n()
  const summer = term.term === "summer"
  const order = termOrder(term)
  const over = term.max_credits !== null && term.credits > term.max_credits

  return (
    <Card className={cn(summer && "border-dashed bg-muted/30", term.courses.length === 0 && "opacity-70")}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 font-semibold">
          <span className="flex items-center gap-1.5">
            {summer && <Sun className="size-4 text-warning" aria-hidden />}
            {tr(term)}
          </span>
          {isGraduation && <GraduationCap className="size-4 text-primary" aria-label={t("estGraduation")} />}
        </CardTitle>
        {summer ? (
          <p className="text-xs text-muted-foreground">{t("summerTerm")}</p>
        ) : (
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t("semesterLoad")}</span>
              <span className={cn("font-medium tabular-nums", over && "text-destructive", term.warning && "text-warning")}>
                {num(term.credits)}/{num(term.max_credits ?? 0)}
              </span>
            </div>
            <Bar
              value={term.credits}
              max={term.max_credits ?? 1}
              className="h-1.5"
              barClassName={term.warning ? "bg-warning" : undefined}
              label={t("semesterLoad")}
            />
            {term.warning && (
              <p className="flex items-start gap-1 pt-1 text-[11px] text-warning">
                <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden />
                {t("underMinLoad")}
              </p>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {term.courses.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("noCoursesThisTerm")}</p>
        ) : (
          <ul className="space-y-2">
            {term.courses.map((c) => (
              <CourseRow key={c.code} c={c} from={movedFrom?.get(c.code)} here={order} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function CourseRow({ c, from, here }: { c: PlanCourse; from: number | undefined; here: number }) {
  const { t, tr, num } = useI18n()
  const moved = from !== undefined && from !== here
  const later = moved && here > from
  const flag = c.flag !== "regular" ? flagStyle[c.flag] : null
  const name = tr(courseNames[c.code])

  return (
    <li className={cn("space-y-1.5 rounded-lg border bg-background/60 p-2.5", moved && "border-warning/60 bg-warning-soft/60")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-snug font-medium">{name}</p>
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
        {flag && <span className={cn("rounded px-1.5 py-px font-medium", flag.cls)}>{t(flag.key)}</span>}
      </div>
    </li>
  )
}

function Legend() {
  const { t } = useI18n()
  const items = [
    { flag: "summer_on_demand" as const, hint: t("flagSummerHint") },
    { flag: "college_request" as const, hint: t("flagCollegeRequestHint") },
    { flag: "graduation_request" as const, hint: t("flagGraduationRequestHint") },
  ]
  return (
    <div className="space-y-2 rounded-xl border p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Info className="size-3.5" aria-hidden />
        {t("planLegend")}
      </p>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-3">
        {items.map(({ flag, hint }) => (
          <li key={flag} className="space-y-1 text-xs">
            <span className={cn("inline-block rounded px-1.5 py-px font-medium", flagStyle[flag].cls)}>{t(flagStyle[flag].key)}</span>
            <p className="text-muted-foreground">{hint}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
