"use client"

/**
 * Past semesters: every finished term with its courses, marks and GPA. Not in the top navigation: a finished
 * semester on the dashboard's path opens it at /record?term=<academic year>-<term>, with that semester open and the
 * others closed. Any semester opens and closes on its own after that.
 */
import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowRight, ChevronDown, Snowflake } from "lucide-react"
import { Code, PageHeader } from "@/components/masari/bits"
import { isFailing } from "@/lib/data/student-adapter"
import type { StudentCourseResult } from "@/lib/data/types"
import { semesterLabel } from "@/lib/plan-api"
import { useStudentView } from "@/lib/student-context"
import { type DictKey, useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type PastTerm = ReturnType<typeof useStudentView>["history"][number]

const ORDINAL_AR = ["الأول", "التاني", "التالت", "الرابع", "الخامس", "السادس", "السابع", "التامن", "التاسع", "العاشر",
  "الحادي عشر", "التاني عشر", "التالت عشر", "الرابع عشر"]

export default function RecordPage() {
  const { t } = useI18n()
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("recordBack")}
      </Link>
      <PageHeader title={t("recordTitle")} subtitle={t("recordSubtitle")} />
      <React.Suspense fallback={null}>
        <Terms />
      </React.Suspense>
    </div>
  )
}

function Terms() {
  const { t } = useI18n()
  const { history } = useStudentView()
  const asked = useSearchParams().get("term")
  // The semester picked on the dashboard is open; without one, the latest semester with results.
  const first = history.find((x) => x.key === asked && !x.frozen)?.key ?? [...history].reverse().find((x) => !x.frozen)?.key
  const [open, setOpen] = React.useState<Set<string>>(() => new Set(first ? [first] : []))
  const refs = React.useRef(new Map<string, HTMLElement>())

  // Scrolled to after the page's own entrance animation, which would otherwise cut the scroll short.
  React.useEffect(() => {
    if (!asked || first !== asked) return
    const id = window.setTimeout(() => refs.current.get(asked)?.scrollIntoView({ block: "start" }), 350)
    return () => window.clearTimeout(id)
  }, [asked, first])

  if (history.length === 0) return <p className="text-sm text-muted-foreground">{t("recordEmpty")}</p>
  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // Newest first: the semester the student just finished is at the top.
  return (
    <div className="space-y-3">
      {[...history].reverse().map((x) => (
        <TermCard
          key={x.key}
          term={x}
          open={open.has(x.key)}
          onToggle={() => toggle(x.key)}
          ref={(el) => {
            if (el) refs.current.set(x.key, el)
            else refs.current.delete(x.key)
          }}
        />
      ))}
    </div>
  )
}

function TermCard({ term, open, onToggle, ref }: { term: PastTerm; open: boolean; onToggle: () => void; ref: React.Ref<HTMLElement> }) {
  const { t, num, lang } = useI18n()
  const id = React.useId()
  const s = term.summary
  const ordinal =
    term.sem !== null
      ? lang === "ar"
        ? `الترم ${ORDINAL_AR[term.sem - 1] ?? num(term.sem)}`
        : `Semester ${num(term.sem)}`
      : term.frozen
        ? t("recordFrozen")
        : t("recordSummer")
  const warned = !!s?.academic_standing?.includes("إنذار")
  const gpa = (g: number | null | undefined) => (g === null || g === undefined ? "—" : num(g, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

  return (
    <section ref={ref} className="scroll-mt-20 overflow-hidden rounded-xl bg-card ring-1 ring-border">
      <button
        type="button"
        onClick={term.frozen ? undefined : onToggle}
        aria-expanded={term.frozen ? undefined : open}
        aria-controls={term.frozen ? undefined : id}
        className={cn("flex w-full items-center gap-3 p-4 text-start", !term.frozen && "hover:bg-muted/50", term.frozen && "cursor-default")}
      >
        {/* The semester number sits beside the term, as on the dashboard's path. */}
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold",
            term.sem !== null ? "bg-brand-ink text-card" : "bg-muted text-muted-foreground"
          )}
        >
          {term.frozen && <Snowflake className="size-3.5" aria-hidden />}
          {ordinal}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">{semesterLabel(term.term, term.academicYear, lang)}</span>
            {warned && <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">{t("recordWarning")}</span>}
          </span>
          {!term.frozen && s && (
            <span className="mt-0.5 block text-xs text-muted-foreground tabular">
              {num(s.registered_hours ?? 0)} {t("recordHours")} · {t("recordPassedHours")} {num(s.earned_hours ?? 0)}
            </span>
          )}
          {/* On phones the two GPAs go under the term instead of beside it. */}
          {!term.frozen && s && (
            <span className="mt-1 flex gap-3 text-xs sm:hidden">
              <span className="text-muted-foreground">
                {t("recordTermGpa")} <span className="font-semibold text-foreground tabular">{gpa(s.term_gpa)}</span>
              </span>
              <span className="text-muted-foreground">
                {t("recordCumGpa")} <span className="font-semibold text-brand-accent tabular">{gpa(s.cumulative_gpa)}</span>
              </span>
            </span>
          )}
        </span>
        {!term.frozen && (
          <>
            <Stat label={t("recordTermGpa")} value={gpa(s?.term_gpa)} />
            <Stat label={t("recordCumGpa")} value={gpa(s?.cumulative_gpa)} accent />
            <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} aria-hidden />
          </>
        )}
      </button>
      {term.frozen ? (
        <p className="border-t px-4 py-3 text-sm text-muted-foreground">{t("recordFrozenNote")}</p>
      ) : (
        // Opens by growing its row from 0 to its height.
        <div id={id} className={cn("grid transition-[grid-template-rows] duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <div className="min-h-0 overflow-hidden" inert={!open}>
            <ul className="divide-y border-t">
              {term.courses.map((c) => (
                <CourseRow key={c.code} course={c} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span className="hidden w-20 shrink-0 text-center sm:block">
      <span className="block text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("block text-base font-semibold tabular", accent && "text-brand-accent")}>{value}</span>
    </span>
  )
}

/** The parts of a course's 100 marks, each out of its share (article on assessment): theory 20/30/50; with a lab
 *  the semester work is 20 and the lab exam 10; projects 50 follow-up and 50 discussion. */
function markParts(c: StudentCourseResult): { key: DictKey; got: number; of: number }[] {
  const m = c.marks
  if (!m) return []
  const x = m as Record<string, number | undefined>
  const lab = x.practical !== undefined
  const parts: { key: DictKey; field: string; of: number }[] = [
    { key: "markMidterm", field: "midterm", of: 20 },
    { key: "markCoursework", field: "coursework", of: lab ? 20 : 30 },
    { key: "markPractical", field: "practical", of: 10 },
    { key: "markFinal", field: "final", of: 50 },
    { key: "markFollowup", field: "periodic_followup", of: 50 },
    { key: "markDiscussion", field: "oral_discussion", of: 50 },
  ]
  return parts.filter((p) => x[p.field] !== undefined).map((p) => ({ key: p.key, got: x[p.field]!, of: p.of }))
}

function CourseRow({ course: c }: { course: StudentCourseResult }) {
  const { t, num, lang } = useI18n()
  const failed = isFailing(c.grade)
  const parts = markParts(c)
  // Shares that do not add up to 100 (a course with only part of its marks recorded) are shown as numbers only.
  const full = parts.reduce((s, p) => s + p.of, 0) === 100
  const note = c.grade === "W" ? t("recordWithdrawn") : c.grade === "DN" ? t("recordDeprived") : parts.length === 0 ? t("recordNoMarks") : null

  return (
    <li className="space-y-3 px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{lang === "ar" ? c.name_ar : c.name_en}</span>
            {c.attempt > 1 && (
              <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning">
                {t("recordRetake")}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <Code>{c.code}</Code>
            <span>·</span>
            <span className="tabular">
              {num(c.credits)} {t("recordHours")}
            </span>
          </span>
        </span>
        {c.total !== undefined && (
          <span className="shrink-0 text-end text-sm tabular">
            <span className="font-semibold">{num(c.total)}</span>
            <span className="text-muted-foreground">/{num(100)}</span>
          </span>
        )}
        <span
          dir="ltr"
          className={cn(
            "inline-flex h-8 min-w-11 shrink-0 items-center justify-center rounded-lg px-2 text-sm font-bold",
            failed ? "bg-destructive/10 text-destructive" : c.grade === "W" ? "bg-muted text-muted-foreground" : "bg-brand-accent/12 text-brand-accent"
          )}
        >
          {c.grade ?? "—"}
        </span>
      </div>

      {parts.length > 0 && (
        <div className="space-y-2">
          {/* One row of parts; four parts go two by two on phones. */}
          <dl className={cn("grid gap-2", parts.length === 4 ? "grid-cols-2 sm:grid-cols-4" : parts.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
            {parts.map((p) => (
              <div key={p.key} className="rounded-lg bg-muted/60 px-2.5 py-1.5">
                <dt className="text-[11px] text-muted-foreground">{t(p.key)}</dt>
                <dd className="text-sm tabular">
                  <span className="font-semibold">{num(p.got)}</span>
                  {full && <span className="text-muted-foreground"> / {num(p.of)}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </li>
  )
}
