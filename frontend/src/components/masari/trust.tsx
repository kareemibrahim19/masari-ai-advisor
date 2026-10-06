"use client"

/**
 * Trust primitives: the visual language for Masari's core rule,
 * "a rule-verified result must never look the same as an LLM-written explanation".
 *
 * Provenance is carried by FORM (plus icon and label), not by extra hues, so the page keeps one accent:
 *   VerifiedBadge  solid green fill + shield     → deterministic rules engine
 *   AiExplanation  dashed outline on a tint      → wording drafted by the LLM
 *   SourceChip     outlined document chip        → citation to a regulation (RAG)
 */
import { BookOpenText, FlaskConical, ShieldCheck, Sparkles } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { sources } from "@/lib/mock-data"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

function HintBadge({
  className,
  icon,
  label,
  hint,
}: {
  className: string
  icon: React.ReactNode
  label: string
  hint: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className={cn(
              "inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&>svg]:size-3.5",
              className
            )}
          />
        }
      >
        {icon}
        {label}
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

export function VerifiedBadge({ className }: { className?: string }) {
  const { t } = useI18n()
  return (
    <HintBadge
      className={cn("bg-verified-soft text-verified", className)}
      icon={<ShieldCheck aria-hidden />}
      label={t("verified")}
      hint={t("verifiedHint")}
    />
  )
}

export function AiBadge({ className }: { className?: string }) {
  const { t } = useI18n()
  return (
    <HintBadge
      className={cn("border border-dashed border-ai/50 bg-transparent text-ai", className)}
      icon={<Sparkles aria-hidden />}
      label={t("aiExplanation")}
      hint={t("aiExplanationHint")}
    />
  )
}

export function DemoBadge({ className }: { className?: string }) {
  const { t } = useI18n()
  return (
    <HintBadge
      className={cn("bg-warning-soft text-warning", className)}
      icon={<FlaskConical aria-hidden />}
      label={t("demoData")}
      hint={t("demoDataHint")}
    />
  )
}

export function SourceChip({ sourceId, className }: { sourceId: string; className?: string }) {
  const { tr, t } = useI18n()
  const s = sources[sourceId]
  if (!s) return null
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-source-soft px-2 py-1 text-xs text-source",
        className
      )}
    >
      <BookOpenText className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{t("source")}: </span>
      <span className="truncate font-medium">{tr(s.title)}</span>
      <span className="truncate text-muted-foreground">{tr(s.locator)}</span>
    </span>
  )
}

/** Explanation block written by the LLM — visually distinct from verified facts. */
export function AiExplanation({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-dashed border-ai/40 bg-ai-soft px-3.5 py-3", className)}>
      <AiBadge className="mb-1.5 h-5 border-0 px-0" />
      <p className="max-w-[68ch] text-sm leading-relaxed text-foreground/90 text-pretty">{children}</p>
    </div>
  )
}

const confStyles = {
  high: { cls: "text-verified", bars: 3, key: "confHigh" },
  medium: { cls: "text-warning", bars: 2, key: "confMedium" },
  low: { cls: "text-destructive", bars: 1, key: "confLow" },
} as const

export function ConfidenceMeter({
  level,
  responses,
  className,
}: {
  level: "high" | "medium" | "low"
  responses?: number
  className?: string
}) {
  const { t, num } = useI18n()
  const s = confStyles[level]
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <span className="flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn("w-1 rounded-sm", i <= s.bars ? "bg-current" : "bg-muted-foreground/25", s.cls)}
            style={{ height: 4 + i * 3 }}
          />
        ))}
      </span>
      <span className="text-muted-foreground">{t("confidence")}:</span>
      <span className={cn("font-medium", s.cls)}>{t(s.key)}</span>
      {responses !== undefined && (
        <span className="text-muted-foreground">
          · {num(responses)} {t("responses")}
        </span>
      )}
    </span>
  )
}
