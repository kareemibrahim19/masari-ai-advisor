"use client"

/**
 * Column chart of a course over the last 10 years: one column per instructor who taught it that year, its height the
 * students' average total (out of 100). This term's instructor(s) wear their series colour (the same as the cards
 * below); earlier instructors are grey. The line at 60 is the pass mark. Hover a column for the instructor, the pass
 * rate and the number of students; the table under the chart has every value.
 */
import * as React from "react"
import type { CourseYear } from "@/lib/data/instructor-grades-source"
import { useI18n } from "@/lib/i18n"

const H = 240
const M = { top: 18, right: 52, bottom: 28, left: 34 }
const PASS = 60
const OTHER = "var(--chart-5)"

const yearLabel = (y: string) => y.replace(/^\d{2}(\d{2})-\d{2}(\d{2})$/, "$1/$2")

export function GradeChart({ history, current }: { history: CourseYear[]; current: { id: string; color: string }[] }) {
  const { t, tr, num } = useI18n()
  const box = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(600)
  const [hover, setHover] = React.useState<number | null>(null)

  React.useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const colorOf = (id: string) => current.find((c) => c.id === id)?.color ?? OTHER
  const order = (id: string) => {
    const i = current.findIndex((c) => c.id === id)
    return i < 0 ? current.length : i
  }
  const years = [...new Set(history.map((h) => h.year))].sort()
  const perYear = years.map((y) => history.filter((h) => h.year === y).sort((a, b) => order(a.instructorId) - order(b.instructorId)))
  const most = Math.max(1, ...perYear.map((g) => g.length))
  const plotW = width - M.left - M.right
  const plotH = H - M.top - M.bottom
  const groupW = plotW / Math.max(1, years.length)
  const barW = Math.max(6, Math.min(24, (groupW * 0.7) / most - 2))
  const step = barW + 2 // a 2px gap between neighbouring columns
  const y = (v: number) => M.top + plotH * (1 - Math.min(100, Math.max(0, v)) / 100)
  const pct = (v: number) => `${num(Math.round(v * 100))}%`

  // Flatten to columns with their position, so hover and the tooltip use one index.
  const cols = perYear.flatMap((g, yi) =>
    g.map((h, k) => ({ h, x: M.left + groupW * yi + groupW / 2 + (k - (g.length - 1) / 2) * step }))
  )
  const hovered = hover === null ? null : cols[hover]
  const showValues = barW >= 18
  const hasOthers = history.some((h) => !current.some((c) => c.id === h.instructorId))
  // Only this term's instructors who have columns (one teaching the course for the first time has none yet).
  const currentNames = current.flatMap((c) => {
    const name = history.find((h) => h.instructorId === c.id)?.name
    return name ? [{ ...c, name }] : []
  })

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs" aria-label={t("chartLegend")}>
        {currentNames.map((c) => (
          <li key={c.id} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: c.color }} aria-hidden />
            {tr(c.name)}
          </li>
        ))}
        {hasOthers && (
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: OTHER }} aria-hidden />
            {t("previousInstructors")}
          </li>
        )}
      </ul>

      <div ref={box} className="relative" dir="ltr">
        <svg width={width} height={H} role="img" aria-label={t("chartAria")} className="block overflow-visible">
          {[0, 20, 40, 60, 80, 100].map((v) => (
            <g key={v}>
              <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
              <text x={M.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                {num(v)}
              </text>
            </g>
          ))}
          <line x1={M.left} x2={width - M.right} y1={y(PASS)} y2={y(PASS)} stroke="var(--muted-foreground)" strokeWidth={1.5} />
          {/* in the right margin, clear of the columns */}
          <text x={width - M.right + 6} y={y(PASS)} dy="0.32em" textAnchor="start" className="fill-muted-foreground text-[10px]">
            {t("passMark")}
          </text>

          {years.map((yr, yi) => (
            <text key={yr} x={M.left + groupW * yi + groupW / 2} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">
              {yearLabel(yr)}
            </text>
          ))}

          {cols.map(({ h, x }, i) => {
            const left = x - barW / 2
            const top = y(h.mean)
            const r = Math.min(4, (y(0) - top) / 2, barW / 2)
            return (
              <g key={`${h.year}-${h.instructorId}`} opacity={hover !== null && hover !== i ? 0.35 : 1} className="transition-opacity">
                {/* 4px rounded top, square at the baseline */}
                <path
                  d={`M${left},${y(0)} V${top + r} Q${left},${top} ${left + r},${top} H${left + barW - r} Q${left + barW},${top} ${left + barW},${top + r} V${y(0)} Z`}
                  fill={colorOf(h.instructorId)}
                />
                {showValues && (
                  <text x={x} y={top - 4} textAnchor="middle" className="fill-foreground text-[10px] font-medium tabular-nums">
                    {num(Math.round(h.mean))}
                  </text>
                )}
                <rect x={x - step / 2} y={M.top} width={step} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
              </g>
            )
          })}
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute z-10 w-max max-w-56 -translate-x-1/2 -translate-y-full rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
            style={{ left: hovered.x, top: y(hovered.h.mean) - 18 }}
            dir="auto"
          >
            <p className="flex items-center gap-1.5 font-medium">
              <span className="size-2 rounded-sm" style={{ background: colorOf(hovered.h.instructorId) }} aria-hidden />
              {tr(hovered.h.name)} · {yearLabel(hovered.h.year)}
            </p>
            <p className="mt-1 text-muted-foreground">
              {t("statMean")}: <span className="font-medium text-foreground tabular-nums">{num(hovered.h.mean)}</span>
            </p>
            <p className="text-muted-foreground">
              {t("passRate")}: <span className="font-medium text-foreground tabular-nums">{pct(hovered.h.passRate)}</span> · {num(hovered.h.students)}{" "}
              {t("studentsWord")}
            </p>
          </div>
        )}
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer font-medium text-primary">{t("chartTable")}</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-start tabular-nums">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-1.5 text-start font-medium">{t("yearWord")}</th>
                <th className="py-1.5 text-start font-medium">{t("instructorWord")}</th>
                <th className="py-1.5 text-start font-medium">{t("statMean")}</th>
                <th className="py-1.5 text-start font-medium">{t("passRate")}</th>
                <th className="py-1.5 text-start font-medium">{t("studentsWord")}</th>
              </tr>
            </thead>
            <tbody>
              {[...cols].reverse().map(({ h }) => (
                <tr key={`${h.year}-${h.instructorId}`} className="border-b last:border-0">
                  <td className="py-1.5">{yearLabel(h.year)}</td>
                  <td className="py-1.5">{tr(h.name)}</td>
                  <td className="py-1.5">{num(h.mean)}</td>
                  <td className="py-1.5">{pct(h.passRate)}</td>
                  <td className="py-1.5">{num(h.students)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
