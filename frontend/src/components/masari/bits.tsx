"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { categoryLabels as categoryLabel, type Category } from "@/lib/aie-program"
import { useI18n } from "@/lib/i18n"

/** False on the first paint, true a moment later: lets a bar or ring grow from zero when the page opens. */
function useEntered(on: boolean) {
  const [entered, setEntered] = React.useState(!on)
  React.useEffect(() => {
    if (!on) return
    const id = window.setTimeout(() => setEntered(true), 120)
    return () => window.clearTimeout(id)
  }, [on])
  return entered
}

/**
 * A number that counts up from zero when first shown, in step with a growing Ring or Bar
 * (same 0.2s delay and 1.2s ease-out). Screen readers and reduced-motion users get the final value at once.
 */
export function CountUp({
  value,
  className,
  decimals = 0,
  format,
}: {
  value: number
  className?: string
  /** Decimal places while counting: 1 counts in steps of 0.1 (the GPA). The last value is always exact. */
  decimals?: number
  /** Number format for the shown value (e.g. keep "3.0" rather than "3"). */
  format?: Intl.NumberFormatOptions
}) {
  const { num } = useI18n()
  const [shown, setShown] = React.useState(0)
  React.useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let frame = 0
    const start = performance.now() + 200
    const tick = (now: number) => {
      const p = still ? 1 : Math.min(1, Math.max(0, (now - start) / 1200))
      const step = 10 ** decimals
      setShown(p === 1 ? value : Math.round(value * (1 - Math.pow(1 - p, 3)) * step) / step)
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, decimals])
  return (
    <span className={className}>
      <span aria-hidden>{num(shown, format)}</span>
      <span className="sr-only">{num(value, format)}</span>
    </span>
  )
}

/**
 * Text that changes like an airport board: when `value` changes, the old words fold away and the new ones
 * fold in, one word after another. Whole words flip (letters would break Arabic joining). No motion on first show.
 */
export function FlipText({ value, className }: { value: string; className?: string }) {
  const [s, setS] = React.useState<{ cur: string; old: string | null; n: number }>({ cur: value, old: null, n: 0 })
  if (s.cur !== value) setS({ cur: value, old: s.cur, n: s.n + 1 })
  const words = (text: string, anim: string, base: number) =>
    text.split(" ").map((w, i) => (
      <React.Fragment key={i}>
        {i > 0 && " "}
        <span className="inline-block" style={{ animation: `${anim} ${i * 0.07 + base}s both` }}>
          {w}
        </span>
      </React.Fragment>
    ))
  return (
    <span className={cn("inline-grid [perspective:420px]", className)}>
      {s.old !== null && (
        <span key={`o${s.n}`} aria-hidden className="[grid-area:1/1]" onAnimationEnd={(e) => e.target === e.currentTarget.lastElementChild && setS((x) => ({ ...x, old: null }))}>
          {words(s.old, "masari-flip-out .16s ease-in", 0)}
        </span>
      )}
      <span key={`n${s.n}`} className="[grid-area:1/1]">
        {s.n > 0 ? words(value, "masari-flip-in .24s ease-out", 0.14) : value}
      </span>
    </span>
  )
}

export function Bar({
  value,
  max = 100,
  className,
  barClassName,
  label,
  grow = false,
}: {
  value: number
  max?: number
  className?: string
  barClassName?: string
  label?: string
  /** Grow from zero when first shown (dashboard entrance). */
  grow?: boolean
}) {
  const entered = useEntered(grow)
  const pct = entered ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn("h-full rounded-full bg-primary transition-[width]", grow ? "delay-200 duration-1200 ease-out" : "duration-500", barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Ring({
  value,
  max,
  size = 72,
  grow = false,
  children,
}: {
  value: number
  max: number
  size?: number
  /** Fill from zero when first shown (dashboard entrance). */
  grow?: boolean
  children?: React.ReactNode
}) {
  const entered = useEntered(grow)
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const pct = entered ? Math.max(0, Math.min(1, value / max)) : 0
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          className={cn("stroke-primary transition-[stroke-dashoffset]", grow ? "delay-200 duration-1200 ease-out" : "duration-700")}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

const neutral = "bg-muted text-muted-foreground ring-1 ring-inset ring-border"

/** One accent only: AI-core departments get charcoal (filled / outlined), projects get orange, the rest stay neutral. */
export const categoryStyles: Record<Category, string> = {
  CSE: "bg-cat-dept-soft text-cat-dept",
  ECE: "text-foreground ring-1 ring-inset ring-foreground/30",
  BAS: neutral,
  ARI: "bg-highlight-soft text-highlight-ink",
  UNR: neutral,
  ENG: neutral,
  ELE: neutral,
  PDE: neutral,
}

/** Department code tag (e.g. "CSE") with the full department name as tooltip / accessible label. */
export function CategoryTag({ category, className }: { category: Category; className?: string }) {
  const { tr } = useI18n()
  const label = tr(categoryLabel[category])
  return (
    <span
      title={label}
      aria-label={label}
      className={cn("inline-flex h-5 items-center rounded-full px-2 font-mono text-[11px] font-medium", categoryStyles[category], className)}
    >
      {category}
    </span>
  )
}

/** Elective slot badge, e.g. "E2 · L300". */
export function SlotTag({ slot, group, className }: { slot: string; group?: string; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-full border border-dashed border-highlight px-2 font-mono text-[11px] font-medium text-highlight-ink", className)}>
      {slot}
      {group && <span className="opacity-70">· {group}</span>}
    </span>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-balance md:text-3xl">{title}</h1>
        {subtitle && <p className="max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground text-pretty">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/** Code shown in its own LTR island so "CS301" never gets reordered inside Arabic text. */
export function Code({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" translate="no" className={cn("font-mono font-medium tracking-tight", className)}>
      {children}
    </bdi>
  )
}
