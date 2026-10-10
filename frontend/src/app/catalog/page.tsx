"use client"

import * as React from "react"
import { Check, ChevronDown, Flower2, Leaf, Lock, RotateCcw, Search, Star, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CategoryTag, Code, PageHeader } from "@/components/masari/bits"
import { SourceChip, VerifiedBadge } from "@/components/masari/trust"
import {
  categoryLabels,
  courseNameIn,
  courses,
  dependentsOf,
  electivePools,
  levelOf,
  programFacts,
  termOf,
  totalProgramCredits,
  typeLabels,
  type Category,
  type Course,
  type CourseType,
  type PoolCourse,
} from "@/lib/aie-program"
import { assessment, gpaFormula, gradeScale, loadTable, ruleSections } from "@/lib/aie-regulations"
import { statusOf, type Status } from "@/lib/rules"
import { useStudentView } from "@/lib/student-context"
import { type DictKey, useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export default function CatalogPage() {
  const { t, tr } = useI18n()
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <PageHeader title={t("catalogTitle")} subtitle={`${tr(programFacts.degree)} · ${tr(programFacts.institution)}`} />
      <Tabs defaultValue="courses" className="gap-5">
        <TabsList className="h-11! w-full sm:w-fit">
          <TabsTrigger value="courses" className="px-5">
            {t("tabCatalogCourses")}
          </TabsTrigger>
          <TabsTrigger value="regulations" className="px-5">
            {t("tabRegulations")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="courses">
          <CoursesCatalog />
        </TabsContent>
        <TabsContent value="regulations">
          <Regulations />
        </TabsContent>
      </Tabs>
      <p className="text-xs text-muted-foreground">{t("catalogSource")}</p>
    </div>
  )
}

// ------------------------------------------------------------------------------ status

type StatusKind = Status["kind"]
const statusKey: Record<StatusKind, DictKey> = { passed: "stPassed", failed: "stFailed", eligible: "stEligible", locked: "stLocked" }

function StatusPill({ status, className }: { status: Status; className?: string }) {
  const { t, num } = useI18n()
  const styles: Record<StatusKind, string> = {
    passed: "bg-verified-soft text-verified",
    failed: "bg-destructive/10 text-destructive",
    eligible: "bg-primary/10 text-primary",
    locked: "bg-muted text-muted-foreground",
  }
  const Icon = { passed: Check, failed: X, eligible: Check, locked: Lock }[status.kind]
  const missing = status.kind === "locked" || status.kind === "failed" ? status.missing : []
  const short = status.kind === "locked" ? status.creditsShort : 0
  return (
    <span className={cn("inline-flex max-w-full flex-col gap-0.5", className)}>
      <span className={cn("inline-flex h-6 w-fit items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap", styles[status.kind])}>
        <Icon className="size-3.5" aria-hidden />
        {t(statusKey[status.kind])}
      </span>
      {missing.length > 0 && (
        <span className="text-[11px] text-muted-foreground">
          {t("short")}: {missing.map((m, i) => (
            <React.Fragment key={m}>
              {i > 0 && "، "}
              <Code>{m}</Code>
            </React.Fragment>
          ))}
        </span>
      )}
      {short > 0 && (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {t("short")}: {num(short)} {t("creditsShort")}
        </span>
      )}
    </span>
  )
}

function TermBadge({ semester }: { semester: number }) {
  const { t, num } = useI18n()
  const fall = termOf(semester) === "fall"
  const Icon = fall ? Leaf : Flower2
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="inline-flex items-center gap-1 text-sm font-medium whitespace-nowrap">
        <Icon className={cn("size-3.5", fall ? "text-highlight-ink" : "text-chart-2")} aria-hidden />
        {t("semesterLabel")} {num(semester)}
      </span>
      <span className="text-[11px] text-muted-foreground">
        {fall ? t("fall") : t("spring")} · {t("levelLabel")} {num(levelOf(semester))}
      </span>
    </span>
  )
}

function CodeLinks({ codes, onPick }: { codes: string[]; onPick: (code: string) => void }) {
  const { t, lang } = useI18n()
  const { record } = useStudentView()
  if (!codes.length) return <span className="text-muted-foreground">{t("none")}</span>
  return (
    <span className="flex flex-wrap gap-1">
      {codes.map((c) => {
        const passed = record.passed.includes(c)
        return (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            title={courseNameIn(c, lang)}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs transition-colors focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
              passed ? "bg-verified-soft text-verified hover:bg-verified-soft/70" : "bg-muted hover:bg-accent"
            )}
          >
            {passed && <Check className="size-3" aria-hidden />}
            <Code>{c}</Code>
          </button>
        )
      })}
    </span>
  )
}

// ------------------------------------------------------------------------------ courses tab

type Filters = { q: string; level: string; semester: string; category: string; type: string; term: string; status: string }
const emptyFilters: Filters = { q: "", level: "all", semester: "all", category: "all", type: "all", term: "all", status: "all" }

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  const { t } = useI18n()
  const id = React.useId()
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        <option value="all">{t("all")}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function CoursesCatalog() {
  const { t, tr, num } = useI18n()
  const [f, setF] = React.useState<Filters>(emptyFilters)
  const [open, setOpen] = React.useState<string | null>(null)
  const set = (k: keyof Filters) => (v: string) =>
    setF((p) => ({ ...p, [k]: v, ...(k === "level" ? { semester: "all" } : {}) }))
  const pick = (code: string) => {
    setF({ ...emptyFilters, q: code })
    setOpen(code)
  }

  const { record } = useStudentView()
  const statuses = React.useMemo(() => new Map(courses.map((c) => [c.code, statusOf(c.code, record)])), [record])
  const q = f.q.trim().toLowerCase()
  const rows = courses.filter((c) => {
    if (q) {
      const pool = c.electiveGroup ? electivePools[c.electiveGroup] : []
      const hit = (x: { code: string; name: string }) =>
        x.code.toLowerCase().includes(q) || x.name.toLowerCase().includes(q) || courseNameIn(x.code, "ar").includes(q)
      if (!hit(c) && !pool.some(hit)) return false
    }
    if (f.level !== "all" && levelOf(c.semester) !== Number(f.level)) return false
    if (f.semester !== "all" && c.semester !== Number(f.semester)) return false
    if (f.category !== "all" && c.category !== f.category) return false
    if (f.type !== "all" && c.type !== f.type) return false
    if (f.term !== "all" && termOf(c.semester) !== f.term) return false
    if (f.status !== "all" && statuses.get(c.code)!.kind !== f.status) return false
    return true
  })
  const shownCredits = rows.reduce((s, c) => s + c.credits, 0)
  const active = Object.entries(f).some(([k, v]) => v !== emptyFilters[k as keyof Filters])

  const semOptions = Array.from({ length: 10 }, (_, i) => i + 1)
    .filter((s) => f.level === "all" || levelOf(s) === Number(f.level))
    .map((s) => ({ value: String(s), label: `${t("semesterLabel")} ${num(s)} · ${termOf(s) === "fall" ? t("fall") : t("spring")}` }))

  const slotCount = courses.filter((c) => c.type === "elective").length
  const stats: { value: string; label: string; hint?: string }[] = [
    { value: num(totalProgramCredits), label: t("statTotalCredits") },
    { value: num(courses.length - slotCount), label: t("statCourses") },
    { value: num(slotCount), label: t("statElectiveSlots") },
    { value: num(programFacts.semesters), label: t("statSemesters") },
    { value: `${num(programFacts.universityCredits)} ${t("creditsShort")}`, label: t("universityReq"), hint: t("perBylaws") },
    { value: `${num(programFacts.collegeCredits)} ${t("creditsShort")}`, label: t("collegeReq"), hint: t("perBylaws") },
    { value: `${num(programFacts.specializationCredits)} ${t("creditsShort")}`, label: t("specializationReq"), hint: t("perBylaws") },
  ]

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7" aria-label="Program figures">
        {stats.map((s) => (
          <Card key={s.label} size="sm">
            <CardContent className="space-y-0.5">
              <p className="text-xl font-bold text-primary tabular-nums">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              {s.hint && <p className="text-[10px] text-muted-foreground/80">{s.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Filters */}
      <Card>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-[minmax(0,2fr)_repeat(6,minmax(0,1fr))]">
            <div className="col-span-2 min-w-0 space-y-1.5 md:col-span-4 xl:col-span-1">
              <label htmlFor="catalog-search" className="text-xs font-medium text-muted-foreground">
                {t("search")}
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="catalog-search"
                  name="q"
                  type="search"
                  autoComplete="off"
                  spellCheck={false}
                  value={f.q}
                  onChange={(e) => set("q")(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="h-10 bg-card ps-9"
                />
              </div>
            </div>
            <FilterSelect label={t("levelLabel")} value={f.level} onChange={set("level")} options={[0, 1, 2, 3, 4].map((l) => ({ value: String(l), label: `${t("levelLabel")} ${num(l)}` }))} />
            <FilterSelect label={t("semesterLabel")} value={f.semester} onChange={set("semester")} options={semOptions} />
            <FilterSelect
              label={t("departmentLabel")}
              value={f.category}
              onChange={set("category")}
              options={(Object.keys(categoryLabels) as Category[]).map((c) => ({ value: c, label: `${c} – ${tr(categoryLabels[c])}` }))}
            />
            <FilterSelect label={t("typeLabel")} value={f.type} onChange={set("type")} options={(Object.keys(typeLabels) as CourseType[]).map((k) => ({ value: k, label: tr(typeLabels[k]) }))} />
            <FilterSelect label={t("termLabel")} value={f.term} onChange={set("term")} options={[{ value: "fall", label: t("fall") }, { value: "spring", label: t("spring") }]} />
            <FilterSelect label={t("statusLabel")} value={f.status} onChange={set("status")} options={(Object.keys(statusKey) as StatusKind[]).map((k) => ({ value: k, label: t(statusKey[k]) }))} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <p className="text-sm text-muted-foreground" role="status">
              {t("showing")} <span className="font-semibold text-foreground tabular-nums">{num(rows.length)}</span> {t("coursesWord")} ·{" "}
              <span className="tabular-nums">{num(shownCredits)}</span> {t("creditHours")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <VerifiedBadge />
                <span className="hidden md:inline">{t("statusHint")}</span>
              </span>
              {active && (
                <Button variant="ghost" className="h-9 gap-1.5" onClick={() => setF(emptyFilters)}>
                  <RotateCcw className="size-4" />
                  {t("resetFilters")}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("noResults")}</p>
      ) : (
        <ul className="space-y-2" aria-label={t("tabCatalogCourses")}>
          {rows.map((c) => (
            <CourseRow
              key={c.code}
              course={c}
              status={statuses.get(c.code)!}
              open={open === c.code}
              onToggle={() => setOpen((o) => (o === c.code ? null : c.code))}
              onPick={pick}
            />
          ))}
        </ul>
      )}
      <SourceChip sourceId="catalog" />
    </div>
  )
}

function CourseRow({
  course: c,
  status,
  open,
  onToggle,
  onPick,
}: {
  course: Course
  status: Status
  open: boolean
  onToggle: () => void
  onPick: (code: string) => void
}) {
  const { t, tr, num, lang } = useI18n()
  const { record } = useStudentView()
  const isSlot = c.type === "elective"
  const deps = dependentsOf(c.code)
  const chosen = isSlot ? record.electiveChoices[c.code] : undefined
  const panelId = `row-${c.code.replace(" ", "-")}`

  return (
    <li className={cn("rounded-xl border bg-card transition-shadow", open && "shadow-sm ring-1 ring-primary/25", isSlot && "border-dashed border-highlight/60")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-xl p-3 text-start outline-none focus-visible:ring-3 focus-visible:ring-ring md:grid-cols-[6.5rem_minmax(0,1fr)_3rem_7.5rem_7.5rem_1.25rem] xl:grid-cols-[6.5rem_minmax(0,1fr)_3rem_7.5rem_minmax(0,11rem)_7.5rem_1.25rem]"
      >
        {/* code + category (mobile: stacked with name) */}
        <span className="hidden flex-col gap-1 md:flex">
          <Code className="text-sm">{isSlot ? c.code.replace("ELEC ", "") : c.code}</Code>
          <CategoryTag category={c.category} />
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2 md:hidden">
            <Code className="text-xs text-muted-foreground">{isSlot ? c.code.replace("ELEC ", "") : c.code}</Code>
            <CategoryTag category={c.category} />
          </span>
          <span className="block font-medium">{isSlot ? `${courseNameIn(c.code, lang)} · ${c.electiveGroup}` : courseNameIn(c.code, lang)}</span>
          <span className="text-xs text-muted-foreground">
            {tr(typeLabels[c.type])}
            {chosen && (
              <>
                {" · "}
                {t("yourPick")}: <Code>{chosen}</Code>
              </>
            )}
            <span className="md:hidden">
              {" · "}
              {num(c.credits)} {t("creditsShort")}
            </span>
          </span>
        </span>
        <span className="hidden text-center text-sm font-semibold tabular-nums md:block">{num(c.credits)}</span>
        <span className="hidden md:block">
          <TermBadge semester={c.semester} />
        </span>
        <span className="hidden text-xs xl:block">
          {c.minCredits ? (
            <span className="tabular-nums">
              ≥ {num(c.minCredits)} {t("minEarned")}
            </span>
          ) : isSlot ? (
            <span className="text-muted-foreground">{t("slotOptions")}</span>
          ) : c.prereqs.length ? (
            <span className="flex flex-wrap gap-1">
              {c.prereqs.map((p) => (
                <span key={p} className="rounded-md bg-muted px-1.5 py-0.5">
                  <Code>{p}</Code>
                </span>
              ))}
            </span>
          ) : (
            <span className="text-muted-foreground">{t("none")}</span>
          )}
        </span>
        <span className="col-start-2 row-start-1 md:col-start-auto md:row-start-auto">
          <StatusPill status={status} />
        </span>
        <ChevronDown className={cn("hidden size-5 text-muted-foreground transition-transform md:block", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div id={panelId} className="space-y-4 border-t px-3 py-4 md:ps-[calc(6.5rem+1.5rem)]">
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm md:hidden">
            <TermBadge semester={c.semester} />
          </div>
          {isSlot ? (
            <ElectiveOptions group={c.electiveGroup!} chosen={chosen} onPick={onPick} />
          ) : (
            <dl className="grid grid-cols-[minmax(0,1fr)] gap-4 text-sm sm:grid-cols-2">
              <div className="space-y-1.5">
                <dt className="text-xs font-medium text-muted-foreground">{t("prerequisites")}</dt>
                <dd>
                  {c.minCredits ? (
                    <span className="tabular-nums">
                      ≥ {num(c.minCredits)} {t("minEarned")}
                    </span>
                  ) : (
                    <CodeLinks codes={c.prereqs} onPick={onPick} />
                  )}
                </dd>
              </div>
              <div className="space-y-1.5">
                <dt className="text-xs font-medium text-muted-foreground">{t("requiredBy")}</dt>
                <dd>
                  <CodeLinks codes={deps} onPick={onPick} />
                </dd>
              </div>
            </dl>
          )}
        </div>
      )}
    </li>
  )
}

function ElectiveOptions({ group, chosen, onPick }: { group: "L300" | "L400"; chosen?: string; onPick: (code: string) => void }) {
  const { t, num, lang } = useI18n()
  const { record } = useStudentView()
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {t("slotOptions")} ({group}, {num(electivePools[group].length)})
      </p>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-2">
        {electivePools[group].map((p: PoolCourse) => (
          <li key={p.code} className={cn("space-y-2 rounded-lg border bg-background/60 p-3", chosen === p.code && "border-highlight")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {courseNameIn(p.code, lang)}
                  {chosen === p.code && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-highlight-soft px-2 py-0.5 text-[11px] font-medium text-highlight-ink">
                      <Star className="size-3" aria-hidden />
                      {t("yourPick")}
                    </span>
                  )}
                </p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Code>{p.code}</Code> · {num(p.credits)} {t("creditsShort")} <CategoryTag category={p.category} />
                </p>
              </div>
              <StatusPill status={statusOf(p.code, record)} />
            </div>
            <p lang="en" dir="ltr" className="text-start text-xs leading-relaxed text-muted-foreground">
              {p.description}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">{t("prerequisites")}:</span>
              <CodeLinks codes={p.prereqs} onPick={onPick} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ------------------------------------------------------------------------------ regulations tab

function Regulations() {
  const { t, tr, num } = useI18n()
  const { record } = useStudentView()
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            {tr(ruleSections[0].title)}
            <VerifiedBadge />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {loadTable.map((row) => {
                const mine = record.gpa !== null && record.gpa >= (row.min ?? -Infinity) && record.gpa < (row.maxGpa ?? Infinity)
                return (
                  <tr key={row.max} className={cn(mine && "bg-primary/8")}>
                    <td className="px-3 py-2.5">
                      <bdi>{tr(row.range)}</bdi>
                      {mine && <span className="ms-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">{t("yourLimit")}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-end font-semibold tabular-nums">
                      {num(row.max)} {t("creditsShort")}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed">
            {ruleSections[0].items.map((i) => (
              <li key={i.en}>{tr(i)}</li>
            ))}
          </ul>
          {ruleSections[0].note && <p className="rounded-lg bg-warning-soft p-3 text-xs leading-relaxed text-warning">{tr(ruleSections[0].note)}</p>}
          <SourceChip sourceId="load" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{t("gradeScaleTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t("gradeCol")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("pointsCol")}</th>
                  <th className="px-3 py-2 text-start font-medium">%</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {gradeScale.map((g) => (
                  <tr key={g.grade}>
                    <td className="px-3 py-1.5 font-mono font-medium">{g.grade}</td>
                    <td className="px-3 py-1.5 tabular-nums">{g.points}</td>
                    <td className="px-3 py-1.5 tabular-nums" dir="ltr">
                      {g.range}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="rounded-lg bg-muted p-3 text-sm">{tr(gpaFormula)}</p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{t("assessmentTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3">
          {assessment.map((a) => (
            <div key={a.title.en} className="space-y-2">
              <p className="text-sm font-medium">{tr(a.title)}</p>
              <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label={a.parts.map((p) => `${tr(p.label)} ${p.pct}%`).join(", ")}>
                {a.parts.map((p, i) => (
                  <span key={p.label.en} style={{ width: `${p.pct}%` }} className={["bg-primary", "bg-chart-2", "bg-highlight", "bg-cat-dept/40"][i]} />
                ))}
              </div>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {a.parts.map((p) => (
                  <li key={p.label.en} className="flex justify-between">
                    <span>{tr(p.label)}</span>
                    <span className="tabular-nums">{num(p.pct)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      {ruleSections.slice(1).map((s) => (
        <Card key={s.id}>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">{tr(s.title)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed">
              {s.items.map((i) => (
                <li key={i.en}>
                  <bdi>{tr(i)}</bdi>
                </li>
              ))}
            </ul>
            {s.id === "drop" && <SourceChip sourceId="retake" />}
            {s.id === "training" && <SourceChip sourceId="training" />}
            {s.id === "graduation" && <SourceChip sourceId="graduation" />}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
