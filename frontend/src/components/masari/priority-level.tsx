"use client"

/** "High / Medium / Normal priority" as a small pill (lib/rules.ts priorityLevel). The score itself is not shown. */
import { useI18n } from "@/lib/i18n"
import { priorityLevel } from "@/lib/rules"
import { cn } from "@/lib/utils"

const styles = {
  high: { key: "priorityHigh", className: "bg-destructive/10 text-destructive" },
  medium: { key: "priorityMedium", className: "bg-warning-soft text-warning" },
  normal: { key: "priorityNormal", className: "bg-muted text-muted-foreground" },
} as const

export function PriorityLevel({ score, className }: { score: number; className?: string }) {
  const { t } = useI18n()
  const s = styles[priorityLevel(score)]
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap", s.className, className)}>
      {t(s.key)}
    </span>
  )
}
