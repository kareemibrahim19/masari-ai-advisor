"use client"

import { cn } from "@/lib/utils"
import { categoryLabels as categoryLabel, type Category } from "@/lib/aie-program"
import { useI18n } from "@/lib/i18n"

export function Bar({
  value,
  max = 100,
  className,
  barClassName,
  label,
}: {
  value: number
  max?: number
  className?: string
  barClassName?: string
  label?: string
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div className={cn("h-full rounded-full bg-primary transition-[width] duration-500", barClassName)} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Ring({ value, max, size = 72, children }: { value: number; max: number; size?: number; children?: React.ReactNode }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, value / max))
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
          className="stroke-primary transition-[stroke-dashoffset] duration-700"
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
