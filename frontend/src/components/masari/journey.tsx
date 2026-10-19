"use client"

/**
 * "Your path": the student's degree drawn in the language of the Masari symbol.
 * Every connector is the logo's own segment shape (masari-symbol: "C24 58 50 66 50 50"): it leaves a node
 * going straight up and arrives at the next node from below, so the route reads as the logo, repeated.
 *   ◎ charcoal ring  completed semester     ○ grey ring     planned semester
 *   ◌ dashed ring    semester with no courses (should not happen)   ● orange dot    graduation (the logo's destination dot)
 *   ◇ grey diamond   summer semester with courses                   ◉ orange ring   you are here
 * Mirrored in Arabic so the path reads right-to-left.
 *
 * Desktop: the drawing scales to the card. Phones: drawn at 1:1 so labels stay readable,
 * scrolls sideways, and opens centred on "you are here".
 */
import * as React from "react"
import { MoveHorizontal } from "lucide-react"
import { Bot, useBotSetting, type BotElement, type BotMood } from "@/components/masari/bot"
import { findCourse } from "@/lib/aie-program"
import { useI18n } from "@/lib/i18n"
import { semesterLabel, type GraduationPlan } from "@/lib/plan-api"
import { useStudentView } from "@/lib/student-context"
import { cn } from "@/lib/utils"

const STEP = 84 // px between nodes at 1:1
const SUMMER_STEP = 62 // a summer sits closer to its neighbours
const PAD = 48
const H = 214
const BASE_Y = 136
const RISE = 76 // total climb from first node to graduation
// Control-point offset as a share of STEP. The logo bends by ~0.65 of its rise; our rail climbs ~7px per step,
// so a fixed share of the step keeps the same gentle S (out upward, in from below) without turning into loops.
const BEND = 0.24
const DRAW_SPEED = 560 // px per second the path draws itself at when the page opens
const BOT_W = 60 // px: the bot standing on "you are here"
const BOT_H = (BOT_W * 280) / 240
const BOT_FEET = 250 / 280 // where its feet are, as a share of its height (public/masari-bot.js viewBox)
const BOT_STEP_MS = 480 // walking time from one semester to the next
const BOT_MOOD_MS = 6000 // how long the mood from last term's results shows before it stands quietly

type Node =
  | { kind: "done"; label: string; failed: boolean }
  | { kind: "term"; label: string; sem: number | null; summer: boolean; credits: number; empty: boolean; grad: boolean }

/**
 * `plan`: the graduation plan for the target the student picked on the plan page (from the AI service).
 * Without it (still loading the first time, or the service is down) the path uses the local planner.
 */
export function JourneyRail({ plan, loading = false }: { plan?: GraduationPlan | null; loading?: boolean }) {
  const { t } = useI18n()
  return (
    <figure className={cn("m-0 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
      <Rail plan={plan ?? null} />
      <figcaption className="mt-3 space-y-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:hidden">
          <MoveHorizontal className="size-3.5" aria-hidden />
          {t("pathSwipe")}
        </p>
        <span className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <Legend swatch="size-3 rounded-full border-[3px] border-brand-ink" label={t("pathLegendDone")} />
          <Legend swatch="size-3 rounded-full border-[3px] border-muted-foreground/45" label={t("pathLegendPlanned")} />
          <Legend swatch="size-2.5 rotate-45 rounded-[2px] border-[2.5px] border-muted-foreground/60" label={t("pathLegendSummer")} />
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

function Rail({ plan }: { plan: GraduationPlan | null }) {
  const { t, tr, num, dir, lang } = useI18n()
  const scroller = React.useRef<HTMLDivElement>(null)
  const here = React.useRef<SVGGElement>(null)
  const { baselineGraduationIndex, baselinePlan, lastTerm, record, semesterNames, student } = useStudentView()
  const [botSetting] = useBotSetting()
  const withBot = botSetting === "on"

  const semOf = (code: string) => (findCourse(code) as { semester?: number })?.semester ?? 0
  // Main (non-summer) semesters already finished, as recorded in the student file.
  const completed = student.completedSemesters
  const nodes: Node[] = [
    ...Array.from({ length: completed }, (_, i) => ({
      kind: "done" as const,
      label: `${t("semShort")} ${num(i + 1)}`,
      failed: record.failed.some((f) => semOf(f) === i + 1),
    })),
    ...(plan ? planNodes(plan) : localNodes()),
  ]

  // The current semester, then the AI service's plan. Summers that hold only the routine training are left out.
  function planNodes(p: GraduationPlan): Node[] {
    const registered = student.registeredNow.reduce((s, code) => s + ((findCourse(code) as { credits?: number })?.credits ?? 0), 0)
    const ahead = p.terms.filter((x) => x.term !== "summer" || x.courses.some((c) => c.type !== "training"))
    const out: Node[] = [
      { kind: "term", label: tr(semesterNames[0]), sem: p.current_main_semester, summer: false, credits: registered, empty: false, grad: false },
      ...ahead.map((x) => ({
        kind: "term" as const,
        // A summer's year is clear from its neighbours, so it is just "Summer" (keeps the labels apart).
        label: x.term === "summer" ? t("summerShort") : semesterLabel(x.term, x.academic_year, lang),
        sem: x.main_semester,
        summer: x.term === "summer",
        credits: x.credits,
        empty: x.courses.length === 0,
        grad: false,
      })),
    ]
    out[out.length - 1] = { ...(out[out.length - 1] as Extract<Node, { kind: "term" }>), grad: true }
    return out
  }

  // Fallback: the local planner (no summers), up to graduation or the planning horizon.
  function localNodes(): Node[] {
    return (baselineGraduationIndex >= 0 ? baselinePlan.slice(0, baselineGraduationIndex + 1) : baselinePlan).map((term, i) => ({
      kind: "term" as const,
      label: tr(semesterNames[i]),
      sem: completed + 1 + i,
      summer: false,
      credits: term.reduce((s, c) => s + c.credits, 0),
      empty: term.length === 0,
      grad: i === baselineGraduationIndex,
    }))
  }

  const isSummer = (n: Node | undefined) => n?.kind === "term" && n.summer
  const xs = nodes.reduce<number[]>((acc, n, i) => {
    acc.push(i === 0 ? PAD : acc[i - 1] + (isSummer(n) || isSummer(nodes[i - 1]) ? SUMMER_STEP : STEP))
    return acc
  }, [])
  const W = xs[xs.length - 1] + PAD
  const rise = RISE / Math.max(1, nodes.length - 1)
  const pts = xs.map((x, i) => ({ x: dir === "rtl" ? W - x : x, y: BASE_Y - i * rise }))
  // The logo's connector: control point 1 straight above the start node, control point 2 straight below the end node.
  const k = STEP * BEND
  const seg = (a: { x: number; y: number }, p: { x: number; y: number }) => `C${a.x} ${a.y - k} ${p.x} ${p.y + k} ${p.x} ${p.y}`
  const pathTo = (n: number) => pts.slice(0, n).map((p, i) => (i ? seg(pts[i - 1], p) : `M${p.x} ${p.y}`)).join(" ")
  const pathFrom = (n: number) => pts.slice(n).map((p, i) => (i ? seg(pts[n + i - 1], p) : `M${p.x} ${p.y}`)).join(" ")
  const doneCount = completed
  // Opening animation: one pen draws the route at a steady speed, the travelled part then the planned part,
  // and each semester appears as the line reaches it. Times come from the distance along the route.
  const at = (i: number) => (xs[i] - xs[0]) / DRAW_SPEED
  // The travelled line runs up to "you are here" (the current term is under way); the planned grey line goes on from it.
  const planFrom = Math.min(doneCount, nodes.length - 1)
  // "You are here" is the current term: the first planned node, right after the finished semesters.
  const current = doneCount < nodes.length ? doneCount : -1

  // ---- Masari on "you are here": walks there along the path from semester 1, then shows how last term went.
  // Worried on academic warning (or a GPA under 2.00), sad if a course was failed, proud if the term GPA went up.
  // After a few seconds it just stands there quietly.
  const gradeMood: BotMood =
    record.onProbation || (student.gpa !== null && student.gpa < 2)
      ? "worried"
      : lastTerm?.failed
        ? "sad"
        : lastTerm && lastTerm.gpa !== null && lastTerm.previousGpa !== null && lastTerm.gpa > lastTerm.previousGpa
          ? "proud"
          : lastTerm
            ? "happy"
            : "wave"
  const hereNode = current >= 0 ? nodes[current] : null
  const hereIsGrad = hereNode?.kind === "term" && hereNode.grad
  const svgRef = React.useRef<SVGSVGElement>(null)
  const bot = React.useRef<BotElement | null>(null)
  const [scale, setScale] = React.useState(0)
  const [botPhase, setBotPhase] = React.useState<"wait" | "walk" | "calm">("wait")
  React.useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const ro = new ResizeObserver(() => setScale(svg.getBoundingClientRect().width / W))
    ro.observe(svg)
    return () => ro.disconnect()
  }, [W])
  // Start once the drawing has reached "you are here". Positions are offsets from that node, in screen px.
  const walked = React.useRef(false)
  React.useEffect(() => {
    if (walked.current || !withBot || current < 0 || scale <= 0) return
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const offsets = pts.slice(0, current + 1).map((p) => [(p.x - pts[current].x) * scale, (p.y - pts[current].y) * scale] as [number, number])
    let calm: ReturnType<typeof setTimeout>
    const start = setTimeout(() => {
      walked.current = true
      const b = bot.current
      if (!b || typeof b.walkAlong !== "function" || still || current === 0) {
        setBotPhase("walk")
        calm = setTimeout(() => setBotPhase("calm"), BOT_MOOD_MS)
        return
      }
      b.resetWalk()
      b.walkPos = offsets[0]
      b.style.translate = `${offsets[0][0]}px ${offsets[0][1]}px`
      b.walkAlong(offsets.slice(1), BOT_STEP_MS)
      setBotPhase("walk")
      // However the walk goes (or if it is cut short), it ends standing exactly on the node.
      const land = () => {
        clearTimeout(late)
        b.resetWalk()
        calm = setTimeout(() => setBotPhase("calm"), BOT_MOOD_MS)
      }
      const late = setTimeout(land, offsets.length * BOT_STEP_MS + 400)
      b.addEventListener("masari-arrived", land, { once: true })
    }, still ? 0 : at(Math.max(0, current - 1)) * 1000 + 200)
    return () => {
      clearTimeout(start)
      clearTimeout(calm)
    }
    // Runs once, when the drawing's size is first known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withBot, current, scale > 0])

  // Phones: open on "you are here" instead of semester 1. The scroller carries its own dir (below), so its
  // scroll direction is already right here even before the provider updates <html dir>.
  React.useEffect(() => {
    const el = scroller.current
    if (!el || el.scrollWidth <= el.clientWidth || !here.current) return
    const box = here.current.getBoundingClientRect()
    const view = el.getBoundingClientRect()
    el.scrollBy({ left: box.left + box.width / 2 - (view.left + view.width / 2), behavior: "instant" })
  }, [dir, nodes.length])

  return (
    <div
      ref={scroller}
      dir={dir}
      className="-mx-4 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:thin] sm:mx-0 sm:px-0"
      tabIndex={0}
      role="region"
      aria-label={t("pathTitle")}
    >
      <div className="relative w-max sm:w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        // Fills the card, but never shrinks below ~85% so labels stay apart (it scrolls instead).
        style={{ minWidth: Math.round(W * 0.85) }}
        className="block h-auto max-w-none sm:w-full"
        role="img"
        aria-label={t("pathAria")}
      >
        {/* the part already travelled, then the planned rest of the route */}
        <path
          d={pathFrom(planFrom)}
          pathLength={1}
          fill="none"
          className="stroke-muted-foreground/25"
          strokeWidth="7"
          strokeLinecap="round"
          style={{ strokeDasharray: 1, animation: `masari-draw ${at(nodes.length - 1) - at(planFrom)}s linear ${at(planFrom)}s both` }}
        />
        <path
          d={pathTo(planFrom + 1)}
          pathLength={1}
          fill="none"
          className="stroke-brand-ink"
          strokeWidth="7"
          strokeLinecap="round"
          style={{ strokeDasharray: 1, animation: `masari-draw ${at(planFrom)}s linear both` }}
        />

        {nodes.map((n, i) => (
          // The semesters appear one after another along the route.
          <g key={i} style={{ animation: `masari-fade .25s ease ${Math.max(0, at(i) - 0.06)}s both` }}>
            {renderNode(n, i)}
          </g>
        ))}
      </svg>
      {withBot && current >= 0 && scale > 0 && (
        <Bot
          ref={bot}
          mood={botPhase === "calm" ? "idle" : gradeMood}
          arrive={gradeMood}
          outfit={hereIsGrad ? "grad" : "none"}
          label={t("botOnPath")}
          className="absolute transition-opacity duration-200"
          style={{
            width: BOT_W,
            left: pts[current].x * scale - BOT_W / 2,
            top: (pts[current].y - 11) * scale - BOT_FEET * BOT_H,
            opacity: botPhase === "wait" ? 0 : 1,
          }}
        />
      )}
      </div>
    </div>
  )

  function renderNode(n: Node, i: number) {
    const p = pts[i]
    if (n.kind === "done") {
      return (
        <g>
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
        <g ref={i === current ? here : undefined}>
          <circle cx={p.x} cy={p.y} r="15" className="fill-brand-accent" />
          {!(i === current && withBot) && (
            <text x={p.x} y={p.y - 32} textAnchor="middle" className="fill-foreground text-[14px] font-semibold">
              {t("graduation")}
            </text>
          )}
          <text x={p.x} y={p.y + 42} textAnchor="middle" className="fill-foreground text-[13px] font-medium">
            {n.label}
          </text>
          {n.sem && <SemNumber x={p.x} y={p.y + 57} sem={n.sem} />}
          {i === current && <HereMark x={p.x} y={p.y + 74} />}
        </g>
      )
    }
    const isHere = i === current
    if (n.summer) {
      return (
        <g>
          {/* A diamond in the planned-semester grey: orange stays for "you are here" and graduation. */}
          <rect
            x={p.x - 5.5}
            y={p.y - 5.5}
            width="11"
            height="11"
            rx="1.5"
            transform={`rotate(45 ${p.x} ${p.y})`}
            className="fill-card stroke-muted-foreground/60"
            strokeWidth="3.5"
          />
          <text x={p.x} y={p.y - 22} textAnchor="middle" className="fill-muted-foreground text-[11px] tabular">
            {num(n.credits)} {t("creditsShort")}
          </text>
          <text x={p.x} y={p.y + 30} textAnchor="middle" className="fill-muted-foreground text-[11.5px] italic">
            {n.label}
          </text>
        </g>
      )
    }
    return (
      <g ref={isHere ? here : undefined}>
        {isHere && <circle cx={p.x} cy={p.y} r="16" className="fill-brand-accent/15" />}
        <circle
          cx={p.x}
          cy={p.y}
          r="8.5"
          className={
            n.empty ? "fill-card stroke-warning" : isHere ? "fill-card stroke-brand-accent" : "fill-card stroke-muted-foreground/60"
          }
          strokeWidth={n.empty ? 3 : 6.5}
          strokeDasharray={n.empty ? "4 3.5" : undefined}
        />
        {/* The bot stands on "you are here", so that node's credits go down next to its semester number. */}
        {!(isHere && withBot) && (
          <text
            x={p.x}
            y={p.y - 30}
            textAnchor="middle"
            className={n.empty ? "fill-warning text-[12px] font-medium" : "fill-muted-foreground text-[12px] tabular"}
          >
            {n.empty ? t("pathEmpty") : `${num(n.credits)} ${t("creditsShort")}`}
          </text>
        )}
        <text x={p.x} y={p.y + 40} textAnchor="middle" className={isHere ? "fill-foreground text-[13px] font-semibold" : "fill-foreground text-[13px]"}>
          {n.label}
        </text>
        {n.sem && (
          <SemNumber x={p.x} y={p.y + 55} sem={n.sem} extra={isHere && withBot && !n.empty ? `${num(n.credits)} ${t("creditsShort")}` : undefined} />
        )}
        {isHere && <HereMark x={p.x} y={p.y + 72} />}
      </g>
    )
  }
}

/** Plan semester number: small and quiet, for reference only. */
function SemNumber({ x, y, sem, extra }: { x: number; y: number; sem: number; extra?: string }) {
  const { t, num } = useI18n()
  return (
    <text x={x} y={y} textAnchor="middle" className="fill-muted-foreground/70 text-[10.5px]">
      {t("semShort")} {num(sem)}
      {extra && ` · ${extra}`}
    </text>
  )
}

function HereMark({ x, y }: { x: number; y: number }) {
  const { t } = useI18n()
  return (
    <text x={x} y={y} textAnchor="middle" className="fill-highlight-ink text-[11.5px] font-semibold">
      {t("youAreHere")}
    </text>
  )
}
