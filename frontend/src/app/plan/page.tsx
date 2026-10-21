"use client"

import Link from "next/link"
import * as React from "react"
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
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
import { Bar, Code, FlipText, PageHeader } from "@/components/masari/bits"
import { Bot, type BotMood } from "@/components/masari/bot"
import { courseNameIn } from "@/lib/aie-program"
import { useI18n } from "@/lib/i18n"
import {
  PlanError,
  usePlanChoice,
  useGraduationPlan,
  type GraduationPlan,
  type PlanCourse,
  type PlanFlag,
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
  // A course the college opens outside its semester, for whatever reason (graduating on time, behind on it, nothing
  // else runs for the student): one label for the student.
  graduation_request: { key: "flagLateRequest", cls: "bg-primary/10 text-primary" },
  open_request: { key: "flagLateRequest", cls: "bg-primary/10 text-primary" },
  late_request: { key: "flagLateRequest", cls: "bg-primary/10 text-primary" },
  improvement: { key: "flagImprovement", cls: "bg-verified-soft text-verified" },
  graduation_allowance: { key: "flagAllowance", cls: "bg-highlight-soft text-highlight-ink" },
}

/** Projects registered within the hours tolerance must be registered on paper at the faculty. */
const paperStyle = "bg-destructive/10 text-destructive"

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

  const [choice, setChoice] = usePlanChoice(student.id, student.finishTarget)
  const { target, summer: allowSummer } = choice
  const setTarget = (years: TargetYears) => setChoice({ ...choice, target: years })
  const setAllowSummer = (on: boolean) => setChoice({ ...choice, summer: on })
  const [failed, setFailed] = React.useState<string[]>([])
  const [gpaText, setGpaText] = React.useState("")
  const [gpa, setGpa] = React.useState<number | null>(null)

  // Wait for the student to stop typing before asking for a new plan.
  React.useEffect(() => {
    const id = setTimeout(() => setGpa(parseGpa(gpaText)), 400)
    return () => clearTimeout(id)
  }, [gpaText])

  const { data, error, loading, retry } = useGraduationPlan({
    studentId: student.id,
    targetYears: target,
    allowSummer,
    failedCourses: failed,
    expectedTermGpa: gpa,
  })

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
          plan &&
          !(error && !inputRejected) && (
            // While the new target / scenario is computing, the old date is dimmed instead of shown as current.
            <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-2.5" aria-busy={loading}>
              {loading ? (
                <LoaderCircle className="size-5 animate-spin text-muted-foreground" aria-hidden />
              ) : (
                <GraduationCap className="size-5 text-primary" aria-hidden />
              )}
              <div className={cn("transition-opacity", loading && "opacity-50")}>
                <p className="text-xs text-muted-foreground">{t("estGraduation")}</p>
                <p className="text-sm font-semibold">
                  <FlipText value={plan.graduation_term ? tr(plan.graduation_term) : "—"} />
                </p>
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
              const button = (
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
                />
              )
              const body = (
                <>
                  <span className="block text-sm font-semibold">{t(key)}</span>
                  {years === 5 && <span className="block text-[11px] text-muted-foreground">{t("regulationPlan")}</span>}
                  {cell && (
                    <span
                      className={cn(
                        "flex items-start gap-1 text-[11px] leading-snug font-medium",
                        cell.feasible ? "text-verified" : cell.status === "conditional" ? "text-warning" : "text-muted-foreground"
                      )}
                    >
                      {cell.feasible ? (
                        <CheckCircle2 className="mt-px size-3 shrink-0" aria-hidden />
                      ) : cell.status === "conditional" ? (
                        <CircleDashed className="mt-px size-3 shrink-0" aria-hidden />
                      ) : (
                        <XCircle className="mt-px size-3 shrink-0" aria-hidden />
                      )}
                      <span>
                        {cell.feasible ? t("possible") : cell.status === "conditional" ? t("possibleIf") : t("notPossible")}
                        {cell.feasible && cell.summer_courses > 0 && ` · ${num(cell.summer_courses)} ${t("summerCoursesCount")}`}
                      </span>
                    </span>
                  )}
                </>
              )
              // Why a target is not possible shows in the result box below once it is picked.
              return React.cloneElement(button, {}, body)
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
            <Button variant="outline" className="h-11 gap-1.5" onClick={retry}>
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
          <PlanSummary plan={plan} loading={loading} failedNow={failed} whatIfGpa={gpa} />

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

          <Legend improvement={plan.terms.some((term) => term.courses.some((c) => c.flag === "improvement"))} />
        </div>
      )}
    </div>
  )
}

function FailedPicker({ courses, selected, onChange }: { courses: string[]; selected: string[]; onChange: (codes: string[]) => void }) {
  const { t, tr, num, lang } = useI18n()
  // Arabic names when the site is in Arabic, the official English names in English.
  const name = (code: string) => courseNameIn(code, lang)
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

/**
 * Masari next to the verdict: thinks while the plan is computing, points at a GPA warning, and when the target
 * works it celebrates and throws its cap, then stands there in its graduation outfit.
 */
function PlanBot({ status, gpaWarning, loading }: { status: string; gpaWarning: boolean; loading: boolean }) {
  const { t } = useI18n()
  const [cheer, setCheer] = React.useState<"celebrate" | "toss" | null>(null)
  const feasible = status === "feasible" && !gpaWarning
  React.useEffect(() => {
    if (!feasible || loading) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a short celebration each time the verdict turns good
    setCheer("celebrate")
    const toss = setTimeout(() => setCheer("toss"), 3200)
    const done = setTimeout(() => setCheer(null), 6400)
    return () => {
      clearTimeout(toss)
      clearTimeout(done)
      setCheer(null)
    }
  }, [feasible, loading])
  const mood: BotMood = loading ? "thinking" : gpaWarning ? "point" : (cheer ?? "idle")
  return <Bot mood={mood} outfit={feasible ? "grad" : "none"} label={t("botChat")} className="shrink-0 self-center" style={{ width: 92 }} />
}

function PlanSummary({ plan, loading, failedNow, whatIfGpa }: {
  plan: GraduationPlan
  loading: boolean
  failedNow: string[]
  whatIfGpa: number | null
}) {
  const { t, tr, num, lang } = useI18n()
  const target = t(TARGETS.find((x) => x.years === plan.target_years)!.key)
  const grad = plan.graduation_term ? tr(plan.graduation_term) : "—"
  const summer = plan.summer_courses?.length ?? 0
  const requests = plan.college_requests?.length ?? 0
  const status = plan.status ?? (plan.feasible ? "feasible" : "impossible")

  // Graduating at the end of this term with a later target picked: the target does not move the date, so say it is
  // before that target instead of pairing the date with it.
  const { student } = useStudentView()
  const early = student.finishTarget !== null && plan.target_years > student.finishTarget && plan.terms.length === 0
  const finish = early ? t(TARGETS.find((x) => x.years === student.finishTarget)!.key) : ""
  const earlyText =
    lang === "ar"
      ? `هتتخرج في ${grad} (${finish})، قبل هدف ${target}: كل اللي فاضلك مسجله الترم ده، فلو نجحت مفيش مواد للترمات الجاية.`
      : `You graduate in ${grad} (${finish}), before the ${target} target: everything you have left is registered this term, so if you pass there is nothing left for later semesters.`
  const text =
    status === "feasible"
      ? lang === "ar"
        ? `تقدر تتخرج في ${grad} (هدف ${target}).`
        : `You can graduate in ${grad} (${target} target).`
      : status === "conditional"
        ? lang === "ar"
          ? `زي ما إنت ماشي مش هتلحق ${target}، بس تقدر تتخرج في ${grad} لو عملت حاجة من دول:`
          : `As things stand you won't make ${target}, but you can graduate in ${grad} if you do one of these:`
        : lang === "ar"
          ? `مش هتقدر تتخرج في ${target}. أقرب تخرج ليك: ${grad}.`
          : `You can't graduate in ${target}. Your earliest graduation: ${grad}.`
  const routes = plan.routes ?? []
  const Icon = status === "feasible" ? CheckCircle2 : status === "conditional" ? CircleDashed : TriangleAlert

  return (
    <div
      className={cn(
        "space-y-4 rounded-xl border p-4",
        status === "feasible" ? "border-verified/30 bg-verified-soft/50" : "border-warning/40 bg-warning-soft/50"
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2 text-sm font-medium">
          <Icon className={cn("mt-0.5 size-4 shrink-0", status === "feasible" ? "text-verified" : "text-warning")} aria-hidden />
          <div className="space-y-2">
            <p>{status === "feasible" && early ? earlyText : text}</p>
            {status === "conditional" && (
              <ol className="space-y-2">
                {routes.map((r, i) => (
                  <li key={i} className="rounded-lg border bg-background/70 p-2.5 font-normal">
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">
                      {routes.length > 1 ? `${t("routeLabel")} ${num(i + 1)}` : t("routeOnly")}
                      {i === 0 && routes.length > 1 && ` · ${t("routeShownBelow")}`}
                    </p>
                    <ul className="space-y-1">
                      {r.conditions.map((c) => (
                        <li key={c.kind} className="flex items-start gap-2">
                          <span className="mt-1 size-3 shrink-0 rounded-sm border-2 border-warning" aria-hidden />
                          <span>{tr(c)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
            {status !== "feasible" && plan.why && (
              <p className="font-normal text-foreground/85">
                <b className="font-semibold">{t("whyShort")}</b> {tr(plan.why)}
              </p>
            )}
            {plan.frozen && (
              <p className="rounded-lg border bg-background/70 p-2.5 font-normal text-foreground/85">{tr(plan.frozen)}</p>
            )}
            {plan.gpa_warning && (
              <p className="flex items-start gap-1.5 rounded-lg border border-warning/40 bg-background/70 p-2.5 font-normal text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{tr(plan.gpa_warning)}</span>
              </p>
            )}
            {status === "feasible" && plan.risk && (
              <p className={cn("flex items-start gap-1.5 text-xs font-normal", plan.risk.still_possible ? "text-muted-foreground" : "text-warning")}>
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                {tr(plan.risk)}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-background px-2.5 py-1">
              {t("summerCoursesCount")}: <span className="font-semibold tabular-nums">{num(summer)}</span>
            </span>
            <span className="rounded-full bg-background px-2.5 py-1">
              {t("collegeRequestsCount")}: <span className="font-semibold tabular-nums">{num(requests)}</span>
            </span>
          </div>
          <PlanBot status={status} gpaWarning={!!plan.gpa_warning} loading={loading} />
        </div>
      </div>
      <GpaLadder plan={plan} failedNow={failedNow} whatIfGpa={whatIfGpa} />
    </div>
  )
}

/**
 * The three GPA bands and the hours each allows (article 13), shown only when they help:
 *   - the plan needs a higher GPA (a route has a GPA condition): where the student is, and where they must get to;
 *   - the GPA sits just above a band edge (within 0.10): the band they would fall into is flagged;
 *   - the GPA is under 2.00 (now, or expected after this term): marked as academic warning when it applies, with
 *     2.00 as the way back.
 * "You are here" is the cumulative GPA the student has now, not an estimate. The plan's GPA after this term is an
 * estimate (the term GPA it assumes, with the what-if failures, and a retaken course replacing its F): a line under
 * the bands says what it would be and how it was estimated.
 * A student comfortably inside a band does not see it; the summary already says their limit.
 */
const NEAR_EDGE = 0.1

function GpaLadder({ plan, failedNow, whatIfGpa }: { plan: GraduationPlan; failedNow: string[]; whatIfGpa: number | null }) {
  const { t, num } = useI18n()
  const { student, record } = useStudentView()
  const now = student.gpa
  const after = plan.after_this_term.cumulative_gpa
  const termGpa = plan.after_this_term.term_gpa
  const cap = plan.after_this_term.max_credits
  const bandOf = (g: number) => (g < 2 ? "low" : g < 3 ? "mid" : "top") as "low" | "mid" | "top"
  const here = now !== null ? bandOf(now) : after !== null ? bandOf(after) : cap >= 21 ? "top" : cap === 18 ? "mid" : "low"
  // Under 2.00 the hours are the student's limit now (14 on a first warning, 12 from the second in a row); when only
  // the estimate is under 2.00, the plan's cap after this term.
  const bands = [
    { key: "low", label: "< 2.00", hours: here === "low" ? student.maxLoad : cap === 12 ? 12 : 14, from: 0 },
    { key: "mid", label: "2.00 – 2.99", hours: 18, from: 2 },
    { key: "top", label: "3.00 +", hours: 21, from: 3 },
  ] as const
  type Band = (typeof bands)[number]["key"]
  const underTwo = (now !== null && now < 2) || (after !== null && after < 2)
  const onWarning = here === "low" && !!record.onProbation
  const needsTop = plan.status === "conditional" && (plan.routes ?? []).some((r) => r.conditions.some((c) => c.kind === "gpa"))
  // Just above the edge of its band: how far it is from dropping into the one below.
  const hereFrom = bands.find((b) => b.key === here)!.from
  const margin = now !== null && hereFrom > 0 && now - hereFrom < NEAR_EDGE ? now - hereFrom + 0.01 : null
  const below: Band | null = margin !== null ? (here === "top" ? "mid" : "low") : null
  const goal: Band | null = needsTop && here !== "top" ? "top" : underTwo && here === "low" ? "mid" : null
  // How the estimate after this term was made: the term GPA it assumes (the current level, or the what-if's), passing
  // everything (unless the what-if fails some), and a failed course retaken this term replacing its F. The retake is
  // only spelled out when the GPA rises without a higher term GPA, the case that looks wrong without it.
  const retaken = record.failed.filter((c) => student.registeredNow.includes(c) && !failedNow.includes(c))
  const estimate =
    after !== null && termGpa !== null && after !== now
      ? (failedNow.length ? t("ladderEstimateWhatIf") : whatIfGpa !== null ? t("ladderEstimateGpa") : t("ladderEstimate"))
          .replace("{term}", num(termGpa, { minimumFractionDigits: 2 }))
          .replace("{gpa}", num(after, { minimumFractionDigits: 2 })) +
        (retaken.length && now !== null && after > now && termGpa <= now ? " " + t(retaken.length > 1 ? "ladderEstimateRetakes" : "ladderEstimateRetake") : "")
      : null

  if (!needsTop && margin === null && !underTwo) return null
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">
        {t("gpaLadder")}
        {now !== null && ` · ${t("ladderNowHere")}: ${num(now, { minimumFractionDigits: 2 })}`}
      </p>
      <ol className="grid grid-cols-3 gap-1.5 text-center text-xs">
        {bands.map((b) => {
          const isHere = b.key === here
          const warned = isHere && onWarning
          const isGoal = b.key === goal
          const isBelow = b.key === below
          return (
            <li
              key={b.key}
              className={cn(
                "rounded-lg border bg-background/70 px-2 py-1.5",
                isHere && "border-primary bg-primary/10",
                warned && "border-destructive bg-destructive/10",
                isGoal && "border-2 border-dashed border-warning",
                isBelow && "border-warning/60"
              )}
            >
              <span className="block font-semibold tabular-nums" dir="ltr">
                {b.label}
              </span>
              <span className="block text-muted-foreground tabular-nums">
                {num(b.hours)} {t("creditsShort")}
              </span>
              {warned && (
                <span className="mx-auto mt-1 block w-fit rounded-full bg-destructive px-2 py-px text-[11px] font-semibold text-white">
                  {t("ladderOnWarning")}
                </span>
              )}
              {isHere && <span className={cn("mt-0.5 block text-[11px] font-semibold", warned ? "text-destructive" : "text-primary")}>{t("youAreHere")}</span>}
              {isGoal && <span className="mt-0.5 block text-[11px] font-semibold text-warning">{t("gpaGoal")}</span>}
              {isBelow && margin !== null && (
                <span className="mt-0.5 block text-[11px] font-semibold text-warning">
                  {t("ladderMargin").replace("{n}", num(margin, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
                </span>
              )}
            </li>
          )
        })}
      </ol>
      {estimate && <p className="text-xs text-muted-foreground">{estimate}</p>}
      <TermGoal plan={plan} />
    </div>
  )
}

/** The semester GPA this term takes, or more, and the chat for the grade it takes in each course (its grades_needed
 *  tool, asked with the same target). Two cases: under 2.00 now, back to 2.00 (and what missing it means); or a
 *  target that needs the 3.00 band (21 hours), by the end of this term or, when one term is not enough, with 4.00
 *  now and the GPA it then takes next term. */
function TermGoal({ plan }: { plan: GraduationPlan }) {
  const { t, num } = useI18n()
  const top = plan.gpa_needed
  // Under 2.00 with a target that needs 3.00 too: both, 2.00 (the warning) first.
  const goals: { target: number; term_gpa: number; next_term_gpa?: number; reachable: boolean; warning_if_missed: boolean; dismissal_if_missed: boolean }[] = [
    plan.this_term_goal,
    top && { target: 3, term_gpa: top.term_gpa, next_term_gpa: top.from === 1 ? top.next_term_gpa : undefined, reachable: true, warning_if_missed: false, dismissal_if_missed: false },
  ].filter((g): g is NonNullable<typeof g> => !!g)
  if (!goals.length) return null
  const two = (n: number) => num(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div className="space-y-2 rounded-lg border border-warning/50 bg-background/70 p-2.5 text-sm">
      {goals.map((goal) => {
        const risk = goal.dismissal_if_missed ? t("termGoalDismissal") : goal.warning_if_missed ? t("termGoalWarning") : ""
        const question = t("termGoalQuestion").replace("{target}", goal.target.toFixed(2))
        return (
          <div key={goal.target} className="space-y-1">
            <p className="font-medium">
              {!goal.reachable
                ? t("termGoalUnreachable").replace("{target}", two(goal.target))
                : goal.next_term_gpa !== undefined
                  ? t("termGoalTwo").replace("{target}", two(goal.target)).replace("{gpa}", two(goal.term_gpa)).replace("{next}", two(goal.next_term_gpa))
                  : t("termGoal").replace("{target}", two(goal.target)).replace("{gpa}", two(goal.term_gpa))}
              {goal.reachable && risk && <span className="text-destructive"> {risk}</span>}
            </p>
            {goal.reachable && (
              <Link href={`/chat?ask=${encodeURIComponent(question)}`} className="inline-block text-xs font-medium text-primary underline underline-offset-4">
                {t("termGoalChat")}
              </Link>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TermCard({ term, isGraduation, movedFrom }: { term: PlanTerm; isGraduation: boolean; movedFrom: Map<string, number> | null }) {
  const { t, tr, num, lang } = useI18n()
  const summer = term.term === "summer"
  const order = termOrder(term)
  // Over the cap only counts when it is not the 15-hour paper registration.
  const over = term.max_credits !== null && term.credits > term.max_credits && !term.paper_load && !term.allowance

  return (
    <Card className={cn((summer || term.frozen) && "border-dashed bg-muted/30", term.courses.length === 0 && "opacity-70")}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 font-semibold">
          <span className="flex items-center gap-1.5">
            {summer && <Sun className="size-4 text-warning" aria-hidden />}
            {tr(term)}
          </span>
          {isGraduation && <GraduationCap className="size-4 text-primary" aria-label={t("estGraduation")} />}
        </CardTitle>
        {term.frozen ? (
          <p className="text-xs text-muted-foreground">{t("frozenTerm")}</p>
        ) : summer ? (
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
            {(term.paper_load || term.below_minimum_paper) && (
              <p className="pt-1">
                <span className={cn("inline-block rounded px-1.5 py-px text-[11px] font-medium", paperStyle)}>
                  {t("paperRegistration")} · {term.paper_load ? t("paperLoadNote") : t("belowMinimumNote")}
                </span>
              </p>
            )}
            {term.warning && (
              <p className="flex items-start gap-1 pt-1 text-[11px] text-warning">
                <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden />
                {t("underMinLoad")}
              </p>
            )}
            {term.allowance && (
              <p className="pt-1">
                <span className="inline-block rounded bg-highlight-soft px-1.5 py-px text-[11px] font-medium text-highlight-ink">
                  {t("allowanceTermNote")}
                </span>
              </p>
            )}
            {term.short_hint && (
              <div className="mt-1 space-y-1 rounded-md border border-primary/30 bg-primary/5 p-2 text-[11px]">
                <p className="flex items-start gap-1 font-medium">
                  <Info className="mt-px size-3 shrink-0 text-primary" aria-hidden />
                  {tr(term.short_hint)}
                </p>
                <p className="text-muted-foreground">
                  {t("frozenHintCourses")} {term.short_hint.courses.map((code) => courseNameIn(code, lang)).join("، ")}
                </p>
              </div>
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
  const { t, num, lang } = useI18n()
  const moved = from !== undefined && from !== here
  const later = moved && here > from
  const flag = c.flag !== "regular" ? flagStyle[c.flag] : null
  // An elective is shown by its slot: the student picks which course of the pool to take.
  const elective = c.type === "elective" && c.elective_slot
  const name = elective ? t("electiveSlot").replace("{n}", c.elective_slot!.replace("E", "")) : courseNameIn(c.code, lang)

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
        {elective ? (
          <span>{t("electivePick").replace("{level}", num(c.elective_level ?? 0))}</span>
        ) : (
          <Code>{c.code}</Code>
        )}
        <span>
          · {num(c.credits)} {t("creditsShort")}
        </span>
        {flag && (
          <span className={cn("rounded px-1.5 py-px font-medium", flag.cls)}>
            {t(flag.key)}
            {c.flag === "improvement" && c.current_grade && ` · ${t("flagImprovementWas")} ${c.current_grade}`}
          </span>
        )}
        {c.type === "project" && <span className="rounded bg-muted px-1.5 py-px font-medium text-muted-foreground">{t("graduationProject")}</span>}
        {c.paper_registration && (
          <span className={cn("rounded px-1.5 py-px font-medium tabular-nums", paperStyle)}>
            {t("paperRegistration")}
            {c.paper_opened && ` · ${t("paperOpenedNote")}`}
            {c.hours_before !== undefined && c.hours_needed !== undefined && ` · ${num(c.hours_before)}/${num(c.hours_needed)}`}
          </span>
        )}
      </div>
    </li>
  )
}

function Legend({ improvement }: { improvement: boolean }) {
  const { t } = useI18n()
  const items: { flag: Exclude<PlanFlag, "regular">; hint: string }[] = [
    { flag: "summer_on_demand", hint: t("flagSummerHint") },
    { flag: "college_request", hint: t("flagCollegeRequestHint") },
    { flag: "late_request", hint: t("flagLateRequestHint") },
    { flag: "graduation_allowance", hint: t("flagAllowanceHint") },
    // Only when this plan has improvement courses: most students never need it.
    ...(improvement ? [{ flag: "improvement" as const, hint: t("flagImprovementHint") }] : []),
  ]
  return (
    <div className="space-y-2 rounded-xl border p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Info className="size-3.5" aria-hidden />
        {t("planLegend")}
      </p>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-2 xl:grid-cols-4">
        {items.map(({ flag, hint }) => (
          <li key={flag} className="space-y-1 text-xs">
            <span className={cn("inline-block rounded px-1.5 py-px font-medium", flagStyle[flag].cls)}>{t(flagStyle[flag].key)}</span>
            <p className="text-muted-foreground">{hint}</p>
          </li>
        ))}
        {/* Last and full width: every case where the faculty requires paper registration. */}
        <li className="space-y-1 border-t pt-2 text-xs md:col-span-2 xl:col-span-4">
          <span className={cn("inline-block rounded px-1.5 py-px font-medium", paperStyle)}>{t("paperRegistration")}</span>
          <p className="text-muted-foreground">{t("paperRegistrationHint")}</p>
          <ul className="list-disc space-y-0.5 ps-5 text-muted-foreground">
            <li>{t("paperCaseProject")}</li>
            <li>{t("paperCaseLoad15")}</li>
            <li>{t("paperCaseGradUnder12")}</li>
            <li>{t("paperCaseOpened")}</li>
          </ul>
        </li>
      </ul>
    </div>
  )
}
