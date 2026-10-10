"use client"

/**
 * "Your path": the student's degree drawn in the language of the Masari symbol.
 * Every connector is the logo's own segment shape (masari-symbol: "C24 58 50 66 50 50"): it leaves a node
 * going straight up and arrives at the next node from below, so the route reads as the logo, repeated.
 *   ◎ charcoal ring  completed semester     ○ grey ring     planned term
 *   ◌ dashed ring    term with no courses   ● orange dot    graduation (the logo's destination dot)
 * Mirrored in Arabic so the path reads right-to-left.
 *
 * Desktop: the drawing scales to the card. Phones: drawn at 1:1 so labels stay readable,
 * scrolls sideways, and opens centred on "you are here".
 */
import * as React from "react"
import { MoveHorizontal } from "lucide-react"
import { findCourse } from "@/lib/aie-program"
import { useI18n } from "@/lib/i18n"
import { useStudentView } from "@/lib/student-context"

const STEP = 84 // px between nodes at 1:1
const PAD = 48
const H = 214
const BASE_Y = 136
const RISE = 76 // total climb from first node to graduation
// Control-point offset as a share of STEP. The logo bends by ~0.65 of its rise; our rail climbs ~7px per step,
// so a fixed share of the step keeps the same gentle S (out upward, in from below) without turning into loops.
const BEND = 0.24

type Node =
  | { kind: "done"; label: string; failed: boolean }
  | { kind: "term"; label: string; credits: number; empty: boolean; grad: boolean }

export function JourneyRail() {
  const { t } = useI18n()
  return (
    <figure className="m-0">
      <Rail />
      <figcaption className="mt-3 space-y-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:hidden">
          <MoveHorizontal className="size-3.5" aria-hidden />
          {t("pathSwipe")}
        </p>
        <span className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <Legend swatch="size-3 rounded-full border-[3px] border-brand-ink" label={t("pathLegendDone")} />
          <Legend swatch="size-3 rounded-full border-[3px] border-muted-foreground/45" label={t("pathLegendPlanned")} />
          <Legend swatch="size-3 rounded-full border-2 border-dashed border-warning" label={t("pathLegendEmpty")} />
          <Legend swatch="size-2.5 rounded-full bg-warning" label={t("pathHasFail")} />
        </span>
      </figcaption>
    </figure>
  )
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={swatch} aria-hidden />
      {label}
    </span>
  )
}

function Rail() {
  const { t, tr, num, dir } = useI18n()
  const scroller = React.useRef<HTMLDivElement>(null)
  const here = React.useRef<SVGGElement>(null)
  const { baselineGraduationIndex, baselinePlan, record, semesterNames, student } = useStudentView()

  const semOf = (code: string) => (findCourse(code) as { semester?: number })?.semester ?? 0
  // Main (non-summer) semesters already finished, as recorded in the student file.
  const completed = student.completedSemesters
  const nodes: Node[] = [
    ...Array.from({ length: completed }, (_, i) => ({
      kind: "done" as const,
      label: `${t("semShort")} ${num(i + 1)}`,
      failed: record.failed.some((f) => semOf(f) === i + 1),
    })),
    // Planned terms up to graduation (all planned terms if graduation is beyond the planning horizon).
    ...(baselineGraduationIndex >= 0 ? baselinePlan.slice(0, baselineGraduationIndex + 1) : baselinePlan).map((term, i) => ({
      kind: "term" as const,
      label: tr(semesterNames[i]),
      credits: term.reduce((s, c) => s + c.credits, 0),
      empty: term.length === 0,
      grad: i === baselineGraduationIndex,
    })),
  ]

  const W = PAD * 2 + STEP * (nodes.length - 1)
  const rise = RISE / (nodes.length - 1)
  const pts = nodes.map((_, i) => {
    const x = PAD + i * STEP
    return { x: dir === "rtl" ? W - x : x, y: BASE_Y - i * rise }
  })
  // The logo's connector: control point 1 straight above the start node, control point 2 straight below the end node.
  const k = STEP * BEND
  const seg = (a: { x: number; y: number }, p: { x: number; y: number }) => `C${a.x} ${a.y - k} ${p.x} ${p.y + k} ${p.x} ${p.y}`
  const pathTo = (n: number) => pts.slice(0, n).map((p, i) => (i ? seg(pts[i - 1], p) : `M${p.x} ${p.y}`)).join(" ")
  const doneCount = completed
  // "You are here" sits between the last finished semester and the next term; a first-term student is before the first node.
  const half = (dir === "rtl" ? -STEP : STEP) / 2
  const a = pts[doneCount - 1] ?? { x: pts[doneCount].x - half, y: pts[doneCount].y }
  const b = pts[doneCount] ?? { x: a.x + half * 2, y: a.y }
  const hx = (a.x + b.x) / 2
  const hy = (a.y + b.y) / 2

  // Phones: open on "you are here" instead of semester 1. The scroller carries its own dir (below), so its
  // scroll direction is already right here even before the provider updates <html dir>.
  React.useEffect(() => {
    const el = scroller.current
    if (!el || el.scrollWidth <= el.clientWidth || !here.current) return
    const box = here.current.getBoundingClientRect()
    const view = el.getBoundingClientRect()
    el.scrollBy({ left: box.left + box.width / 2 - (view.left + view.width / 2), behavior: "instant" })
  }, [dir])

  return (
    <div
      ref={scroller}
      dir={dir}
      className="-mx-4 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:thin] sm:mx-0 sm:px-0"
      tabIndex={0}
      role="region"
      aria-label={t("pathTitle")}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block h-auto max-w-none sm:w-full sm:min-w-[720px]"
        role="img"
        aria-label={t("pathAria")}
      >
        {/* whole route, then the part already travelled */}
        <path d={pathTo(nodes.length)} fill="none" className="stroke-muted-foreground/25" strokeWidth="7" strokeLinecap="round" />
        <path d={pathTo(doneCount)} fill="none" className="stroke-brand-ink" strokeWidth="7" strokeLinecap="round" />

        {nodes.map((n, i) => {
          const p = pts[i]
          if (n.kind === "done") {
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="8.5" className="fill-card stroke-brand-ink" strokeWidth="6.5" />
                {n.failed && <circle cx={p.x + 9} cy={p.y - 9} r="4.5" className="fill-warning stroke-card" strokeWidth="2" />}
                <text x={p.x} y={p.y + 38} textAnchor="middle" className="fill-muted-foreground text-[13px]">
                  {n.label}
                </text>
              </g>
            )
          }
          if (n.grad) {
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="15" className="fill-brand-accent" />
                <text x={p.x} y={p.y - 32} textAnchor="middle" className="fill-foreground text-[14px] font-semibold">
                  {t("graduation")}
                </text>
                <text x={p.x} y={p.y + 42} textAnchor="middle" className="fill-foreground text-[13px] font-medium">
                  {n.label}
                </text>
              </g>
            )
          }
          return (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r="8.5"
                className={n.empty ? "fill-card stroke-warning" : "fill-card stroke-muted-foreground/60"}
                strokeWidth={n.empty ? 3 : 6.5}
                strokeDasharray={n.empty ? "4 3.5" : undefined}
              />
              <text
                x={p.x}
                y={p.y - 30}
                textAnchor="middle"
                className={n.empty ? "fill-warning text-[12px] font-medium" : "fill-muted-foreground text-[12px] tabular"}
              >
                {n.empty ? t("pathEmpty") : `${num(n.credits)} ${t("creditsShort")}`}
              </text>
              <text x={p.x} y={p.y + 40} textAnchor="middle" className="fill-foreground text-[13px]">
                {n.label}
              </text>
            </g>
          )
        })}

        {/* "you are here": between the last completed semester and the next term */}
        <g ref={here}>
          <line x1={hx} x2={hx} y1={hy - 34} y2={hy + 44} className="stroke-brand-accent" strokeWidth="2" strokeDasharray="3 4" />
          <text x={hx} y={hy + 62} textAnchor="middle" className="fill-highlight-ink text-[12px] font-semibold">
            {t("youAreHere")}
          </text>
        </g>
      </svg>
    </div>
  )
}
