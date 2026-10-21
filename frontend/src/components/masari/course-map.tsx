"use client"

/**
 * The course map: every AIE course in its plan-semester column, with prerequisite links drawn between them.
 * Hovering (or focusing) a course lights up everything it needs (dark) and everything it opens (orange) and dims
 * the rest; clicking pins it and shows its details above the map.
 *
 * Laptops and wider: the ten columns share the card's width, so the whole map is seen without sideways scrolling.
 * Narrower than MIN_W (tablets, phones): drawn at MIN_W and scrolls sideways. Mirrored in Arabic.
 */
import * as React from "react"
import { X } from "lucide-react"
import { CategoryTag, Code } from "@/components/masari/bits"
import {
  allDependentsOf,
  allPrerequisitesOf,
  chainDepth,
  courseNameIn,
  electiveLabel,
  courses,
  dependentsOf,
  electivePools,
  findCourse,
  termOf,
} from "@/lib/aie-program"
import { statusOf } from "@/lib/rules"
import { type DictKey, useI18n } from "@/lib/i18n"
import { useStudentView } from "@/lib/student-context"
import { cn } from "@/lib/utils"

const MIN_W = 960 // below this (tablets, phones) the map scrolls sideways instead of squeezing the names
const PAD = 12 // map edge to first/last column
const GAP = 12 // between columns
const TOP = 40 // room for the column headings
const MIN_NODE_H = 72 // a box grows past this when a long name needs more lines at the current width
const ROW_GAP = 10
const SEMESTERS = 10

type Kind = "passed" | "registered" | "eligible" | "failed" | "locked"
const KINDS: Kind[] = ["passed", "registered", "eligible", "failed", "locked"]
const kindLabel: Record<Kind, DictKey> = {
  passed: "stPassed",
  registered: "stRegistered",
  eligible: "stEligible",
  failed: "stFailed",
  locked: "stLocked",
}
const tone: Record<Kind, string> = {
  passed: "bg-verified-soft border-verified/50 text-verified",
  registered: "bg-highlight-soft border-highlight text-highlight-ink",
  eligible: "bg-card border-foreground/55 text-foreground",
  failed: "bg-destructive/10 border-destructive/50 text-destructive",
  locked: "bg-muted/55 border-border text-muted-foreground",
}
const pill: Record<Kind, string> = {
  passed: "bg-verified-soft text-verified",
  registered: "bg-highlight-soft text-highlight-ink",
  eligible: "bg-foreground/8 text-foreground",
  failed: "bg-destructive/10 text-destructive",
  locked: "bg-muted text-muted-foreground",
}


export function CourseMap() {
  const { t, num, lang, dir } = useI18n()
  const { record, student } = useStudentView()
  const rtl = dir === "rtl"

  // ---------------------------------------------------------------- size: fit the card, scroll only below MIN_W
  const scroller = React.useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = React.useState(0)
  React.useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth))
    ro.observe(el)
    setBoxW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const W = Math.max(MIN_W, boxW)
  const colW = (W - PAD * 2 - GAP * (SEMESTERS - 1)) / SEMESTERS
  const rows = Math.max(...Array.from({ length: SEMESTERS }, (_, i) => courses.filter((c) => c.semester === i + 1).length))
  // Box height: tall enough for the longest name at this column width (measured after layout, never clipped).
  const map = React.useRef<HTMLDivElement>(null)
  const [nodeH, setNodeH] = React.useState(MIN_NODE_H)
  React.useLayoutEffect(() => {
    const boxes = map.current?.querySelectorAll<HTMLElement>("[data-node-body]")
    if (!boxes?.length) return
    let need = 0
    boxes.forEach((b) => (need = Math.max(need, b.scrollHeight)))
    setNodeH(Math.max(MIN_NODE_H, Math.ceil(need) + 12))
  }, [colW, lang])
  const NODE_H = nodeH
  const ROW_H = nodeH + ROW_GAP
  const H = TOP + rows * ROW_H

  const colX = (col: number) => (rtl ? W - PAD - colW - col * (colW + GAP) : PAD + col * (colW + GAP))
  const pos = React.useMemo(() => {
    const out = new Map<string, { x: number; y: number; col: number; row: number }>()
    const count: number[] = Array(SEMESTERS).fill(0)
    courses.forEach((c) => {
      const col = c.semester - 1
      const row = count[col]++
      out.set(c.code, { x: colX(col), y: TOP + row * ROW_H, col, row })
    })
    return out
    // colX depends on W, colW and rtl only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, colW, rtl, ROW_H])

  // ---------------------------------------------------------------- status (with "registered this term")
  const registered = React.useMemo(() => new Set(student.registeredNow), [student.registeredNow])
  const kindOf = React.useCallback(
    (code: string): Kind => {
      const s = statusOf(code, record)
      if (s.kind !== "passed") {
        if (registered.has(code) || student.electiveSlots[code]?.registered) return "registered"
      }
      return s.kind
    },
    [record, registered, student.electiveSlots]
  )

  // ---------------------------------------------------------------- focus
  const [hover, setHover] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<string | null>(null)
  const focus = hover ?? (selected && pos.has(selected) ? selected : null)
  const ups = React.useMemo(() => new Set(focus ? allPrerequisitesOf(focus) : []), [focus])
  const downs = React.useMemo(() => new Set(focus ? allDependentsOf(focus) : []), [focus])

  // ---------------------------------------------------------------- links
  // Link from prerequisite a to course b; `reversed` swaps the edges used, for a link that starts at the course.
  const curve = (a: { x: number; y: number }, b: { x: number; y: number }, reversed = false) => {
    const x1 = rtl !== reversed ? a.x : a.x + colW
    const x2 = rtl !== reversed ? b.x + colW : b.x
    const y1 = a.y + NODE_H / 2
    const y2 = b.y + NODE_H / 2
    const m = (x1 + x2) / 2
    return `M${x1} ${y1} C${m} ${y1} ${m} ${y2} ${x2} ${y2}`
  }
  // Steps from the focused course along the chain (BFS), so its lines can draw outward one step at a time.
  const hops = React.useMemo(() => {
    const walk = (next: (code: string) => string[]) => {
      const out = new Map<string, number>()
      if (!focus) return out
      out.set(focus, 0)
      const queue = [focus]
      while (queue.length) {
        const code = queue.shift()!
        for (const n of next(code)) {
          if (out.has(n)) continue
          out.set(n, out.get(code)! + 1)
          queue.push(n)
        }
      }
      return out
    }
    return { up: walk((code) => findCourse(code)?.prereqs ?? []), down: walk(dependentsOf) }
  }, [focus])
  const base: { d: string; col: number }[] = []
  // Chain links: requirements drawn from the course back to each prerequisite, what it opens drawn forward.
  const chain: { d: string; hop: number; up: boolean }[] = []
  courses.forEach((c) =>
    c.prereqs.forEach((p) => {
      const a = pos.get(p)
      const b = pos.get(c.code)
      if (!a || !b) return
      const d = curve(a, b)
      if (focus && (c.code === focus || ups.has(c.code)) && ups.has(p)) chain.push({ d: curve(b, a, true), hop: hops.up.get(c.code) ?? 0, up: true })
      else if (focus && (p === focus || downs.has(p)) && downs.has(c.code)) chain.push({ d, hop: hops.down.get(p) ?? 0, up: false })
      else base.push({ d, col: a.col })
    })
  )

  // Picking a course from the details box: bring it into view on the map and make it glow for a moment
  // (on phones the map scrolls sideways, so the course may be off screen).
  const [flash, setFlash] = React.useState<{ code: string; n: number } | null>(null)
  const pick = (code: string) => {
    setSelected(code)
    if (pos.has(code)) setFlash((f) => ({ code, n: (f?.n ?? 0) + 1 }))
  }
  React.useEffect(() => {
    if (!flash) return
    const el = map.current?.querySelector(`[data-code="${CSS.escape(flash.code)}"]`)
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })
  }, [flash])

  return (
    <div className="space-y-4">
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label={t("statusLabel")}>
        {KINDS.map((k) => (
          <li key={k} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className={cn("size-3 rounded-[4px] border-[1.5px]", tone[k])} aria-hidden />
            {t(kindLabel[k])}
          </li>
        ))}
      </ul>

      <Details code={selected} kindOf={kindOf} onPick={pick} onClear={() => setSelected(null)} />

      <div
        ref={scroller}
        dir={dir}
        className="-mx-4 overflow-x-auto overscroll-x-contain border-y bg-card [scrollbar-width:thin] sm:mx-0 sm:rounded-2xl sm:border"
        role="region"
        aria-label={t("catViewMap")}
        tabIndex={0}
      >
        {boxW > 0 && (
          <div ref={map} className="relative" style={{ width: W, height: H + 10 }}>
            {Array.from({ length: SEMESTERS }, (_, i) => (
              <div
                key={i}
                className="absolute top-3 truncate text-center text-[11px] font-medium text-muted-foreground"
                style={{ left: colX(i), width: colW, animation: `masari-in .45s ease ${i * 0.05}s both` }}
              >
                {t("semShort")} {num(i + 1)} · {termOf(i + 1) === "fall" ? t("fall") : t("spring")}
              </div>
            ))}

            <svg width={W} height={H} className="pointer-events-none absolute inset-0" aria-hidden>
              <g className={cn("transition-opacity duration-150", focus && "opacity-40")}>
                {base.map((e, i) => (
                  // Each link draws itself from the prerequisite to the course, column by column.
                  <path
                    key={i}
                    d={e.d}
                    pathLength={1}
                    fill="none"
                    strokeWidth="1.25"
                    className="stroke-muted-foreground/35"
                    style={{ strokeDasharray: 1, animation: `masari-draw .9s cubic-bezier(.3,.7,.2,1) ${0.3 + e.col * 0.06}s both` }}
                  />
                ))}
              </g>
              {chain.map((e) => (
                // Keyed by the focus so each new pick draws again, step by step away from the course.
                <path
                  key={`${focus}${e.d}`}
                  d={e.d}
                  pathLength={1}
                  fill="none"
                  strokeWidth="2"
                  className={e.up ? "stroke-foreground" : "stroke-brand-accent"}
                  style={{ strokeDasharray: 1, animation: `masari-draw .22s ease-out ${e.hop * 0.18}s both` }}
                />
              ))}
            </svg>

            {courses.map((c) => {
              const p = pos.get(c.code)!
              const kind = kindOf(c.code)
              const related = !focus || c.code === focus || ups.has(c.code) || downs.has(c.code)
              const lit = related
              const isSlot = c.type === "elective"
              const name = isSlot ? electiveLabel(c.code, student.electiveSlots[c.code]?.code, lang) : courseNameIn(c.code, lang)
              return (
                // Outer box carries the entrance animation; the button's own opacity does the dimming.
                <div
                  key={c.code}
                  data-code={c.code}
                  className="absolute scroll-m-4 rounded-xl bg-card"
                  style={{ left: p.x, top: p.y, width: colW, height: NODE_H, animation: `masari-in .45s ease ${p.col * 0.05 + p.row * 0.025}s both` }}
                >
                  <button
                    type="button"
                    title={`${c.code} · ${name}`}
                    aria-pressed={selected === c.code}
                    onMouseEnter={() => setHover(c.code)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(c.code)}
                    onBlur={() => setHover(null)}
                    onClick={() => setSelected((s) => (s === c.code ? null : c.code))}
                    className={cn(
                      "flex size-full flex-col justify-center overflow-hidden rounded-xl border-[1.5px] px-2 py-1 text-start transition-[opacity,box-shadow,transform] duration-150 hover:-translate-y-px focus-visible:outline-none",
                      tone[kind],
                      isSlot && "border-dashed",
                      c.code === focus && "border-brand-accent",
                      selected === c.code && "ring-3 ring-brand-accent/35",
                      !lit && "opacity-25"
                    )}
                  >
                    <span data-node-body className="flex flex-col">
                      <Code className="text-[10px] leading-none opacity-80">{isSlot ? c.code.replace("ELEC ", "") : c.code}</Code>
                      <span
                        className={cn("mt-1 text-[11px] leading-[1.25] font-medium text-pretty", kind === "locked" ? "text-muted-foreground" : "text-foreground")}
                      >
                        {name}
                      </span>
                    </span>
                  </button>
                  {flash?.code === c.code && (
                    <span
                      key={flash.n}
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-xl"
                      style={{ animation: "masari-flash 1.1s ease .35s both" }}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
        {boxW === 0 && <div style={{ height: H + 10 }} />}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------------------ details of the picked course

function Details({
  code,
  kindOf,
  onPick,
  onClear,
}: {
  code: string | null
  kindOf: (code: string) => Kind
  onPick: (code: string) => void
  onClear: () => void
}) {
  const { t, num, lang } = useI18n()
  const { record, student } = useStudentView()
  const c = code ? findCourse(code) : undefined

  if (!c || !code) {
    return null
  }

  const kind = kindOf(code)
  const s = statusOf(code, record)
  const isSlot = "type" in c && c.type === "elective"
  const semester = "semester" in c ? c.semester : null
  const why =
    kind === "locked" && s.kind === "locked"
      ? s.missing.length
        ? `${t("mapWhyLockedBy")} ${s.missing.map((m) => courseNameIn(m, lang)).join(lang === "ar" ? "، " : ", ")}`
        : s.creditsShort
          ? `${t("mapWhyCredits")} ${num(s.creditsShort)} ${t("creditsShort")}`
          : t("mapWhyPool")
      : t(({ passed: "mapWhyPassed", registered: "mapWhyRegistered", eligible: "mapWhyEligible", failed: "mapWhyFailed", locked: "mapWhyPool" } as const)[kind])
  const prereqs = c.prereqs
  const opens = dependentsOf(code)
  const minCredits = "minCredits" in c ? c.minCredits : undefined

  return (
    <section
      key={code}
      aria-live="polite"
      className="relative grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-4 rounded-2xl border bg-card p-4 md:grid-cols-[minmax(0,1.3fr)_auto_minmax(0,1fr)_minmax(0,1fr)]"
      style={{ animation: "masari-in .3s ease both" }}
    >
      <button
        type="button"
        onClick={onClear}
        aria-label={t("mapClear")}
        title={t("mapClear")}
        className="absolute end-2 top-2 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X className="size-4" aria-hidden />
      </button>

      <div className="min-w-0 space-y-2 pe-8 md:pe-0">
        <div>
          <Code className="text-xs text-muted-foreground">{isSlot ? code.replace("ELEC ", "") : code}</Code>
          <p className="text-lg leading-snug font-semibold">
            {isSlot ? electiveLabel(code, student.electiveSlots[code]?.code, lang) : courseNameIn(code, lang)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-xs font-medium", pill[kind])}>{t(kindLabel[kind])}</span>
          <span className="inline-flex h-6 items-center rounded-full bg-muted px-2 text-xs tabular">
            {num(c.credits)} {t("creditsShort")}
            {semester ? ` · ${t("semShort")} ${num(semester)}` : ""}
          </span>
          <CategoryTag category={c.category} />
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{why}</p>
        {"description" in c && c.description && (
          <p lang="en" dir="ltr" className="text-start text-xs leading-relaxed text-muted-foreground">
            {c.description}
          </p>
        )}
      </div>

      <div className="flex gap-2 md:flex-col">
        <Figure value={num(allDependentsOf(code).length)} label={t("mapUnlocks")} />
        <Figure value={num(chainDepth(code))} label={t("mapChain")} />
      </div>

      <div className="min-w-0 space-y-2">
        <p className="text-xs font-semibold">{t("prerequisites")}</p>
        {minCredits ? (
          <p className="text-sm tabular">
            ≥ {num(minCredits)} {t("minEarned")}
          </p>
        ) : (
          <Chips codes={prereqs} kindOf={kindOf} onPick={onPick} />
        )}
      </div>

      <div className="min-w-0 space-y-2">
        <p className="text-xs font-semibold">{isSlot ? t("mapPoolOptions") : t("mapOpens")}</p>
        {isSlot ? (
          <div className="max-h-40 overflow-y-auto pe-1">
            <Chips codes={electivePools[(c as { electiveGroup: "L300" | "L400" }).electiveGroup].map((p) => p.code)} kindOf={kindOf} onPick={onPick} />
          </div>
        ) : (
          <Chips codes={opens} kindOf={kindOf} onPick={onPick} />
        )}
      </div>
    </section>
  )
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-24 flex-1 rounded-xl bg-muted/70 px-3 py-2">
      <p className="text-2xl leading-none font-semibold tabular">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function Chips({ codes, kindOf, onPick }: { codes: string[]; kindOf: (code: string) => Kind; onPick: (code: string) => void }) {
  const { t, lang } = useI18n()
  if (!codes.length) return <p className="text-sm text-muted-foreground">{t("none")}</p>
  return (
    <span className="flex flex-wrap gap-1.5">
      {codes.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onPick(code)}
          title={code}
          className={cn(
            "inline-flex min-h-7 items-center rounded-lg border px-2 py-0.5 text-start text-xs transition-colors hover:brightness-95 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
            tone[kindOf(code)]
          )}
        >
          <span className="text-foreground">{courseNameIn(code, lang)}</span>
        </button>
      ))}
    </span>
  )
}
