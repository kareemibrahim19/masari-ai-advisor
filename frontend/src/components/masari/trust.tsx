"use client"

/**
 * Trust primitives: wording drafted by the LLM never looks like the rest of the page.
 *
 * Provenance is carried by FORM (plus icon and label), not by extra hues, so the page keeps one accent:
 *   AiExplanation  dashed outline on a tint      → wording drafted by the LLM
 */
import { FlaskConical, Sparkles } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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

/** Explanation block written by the LLM — visually distinct from verified facts. */
export function AiExplanation({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-dashed border-ai/40 bg-ai-soft px-3.5 py-3", className)}>
      <AiBadge className="mb-1.5 h-5 border-0 px-0" />
      <div className="max-w-[68ch] text-sm leading-relaxed text-foreground/90 text-pretty">{children}</div>
    </div>
  )
}
