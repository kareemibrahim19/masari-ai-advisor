"use client"

/**
 * Masari brand marks, using the exact geometry of the brand export (public/brand/masari-symbol-*.svg).
 *
 * Usage rules from the logo set:
 * - Light surfaces: Charcoal path. Dark surfaces: White path. The Orange "destination" dot never changes.
 * - Arabic: the symbol is mirrored so the path reads in the reading direction (masari-lockup-arabic-*.svg),
 *   and the lockup leads with مساري in Readex Pro, Masari in Sora below it.
 * - Small sizes (≤ 32px: avatars, favicons) use the simplified mark with solid nodes (masari-chat-avatar.svg).
 * - The export paints node holes with the page colour; here they are masked so any surface shows through.
 */
import * as React from "react"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export const MARK_PATH = "M24 76 C24 58 50 66 50 50 C50 34 76 42 76 24"

export function MasariMark({ className, title, mirror }: { className?: string; title?: string; mirror?: boolean }) {
  const { dir } = useI18n()
  const id = React.useId()
  const flip = mirror ?? dir === "rtl"
  return (
    <svg
      viewBox="6 6 88 88"
      className={cn("shrink-0 text-brand-ink", flip && "-scale-x-100", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
        <rect width="100" height="100" fill="white" />
        <circle cx="24" cy="76" r="5.5" fill="black" />
        <circle cx="50" cy="50" r="5.5" fill="black" />
      </mask>
      <g mask={`url(#${id})`} fill="currentColor">
        <path d={MARK_PATH} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
        <circle cx="24" cy="76" r="12.5" />
        <circle cx="50" cy="50" r="12.5" />
      </g>
      <circle cx="76" cy="24" r="12.5" className="fill-brand-accent" />
    </svg>
  )
}

/**
 * Horizontal lockup. Follows masari-lockup-light.svg (English) and masari-lockup-arabic-light.svg (Arabic):
 * English → mark, "Masari" (Sora 700), "مساري" + tagline below. Arabic → mirrored mark, "مساري" (Readex 600), "Masari" below.
 */
export function Lockup({
  className,
  tagline = false,
  size = "md",
  symbolOnlyOnMobile = false,
}: {
  className?: string
  tagline?: boolean
  size?: "sm" | "md"
  /** Below 640px show the symbol alone (masari-symbol), e.g. to make room in a crowded top bar. */
  symbolOnlyOnMobile?: boolean
}) {
  const { lang } = useI18n()
  const ar = lang === "ar"
  const sm = size === "sm"
  return (
    <span className={cn("flex items-center", sm ? "gap-2" : "gap-2.5", className)} translate="no">
      <MasariMark className={sm ? "size-8" : "size-10"} />
      <span className={cn("flex-col leading-none", symbolOnlyOnMobile ? "hidden sm:flex" : "flex")}>
        {ar ? (
          <span lang="ar" className={cn("font-arabic font-semibold text-brand-ink", sm ? "text-[19px]" : "text-[23px]")}>
            مساري
          </span>
        ) : (
          <span lang="en" className={cn("font-bold tracking-[-0.03em] text-brand-ink", sm ? "text-[19px]" : "text-[23px]")}>
            Masari
          </span>
        )}
        <span className="mt-1 flex items-baseline gap-2">
          {ar ? (
            <span lang="en" className="text-[11px] font-bold text-muted-foreground">
              Masari
            </span>
          ) : (
            <span lang="ar" className="font-arabic text-[12px] font-medium text-muted-foreground">
              مساري
            </span>
          )}
          {tagline && (
            <span lang="en" dir="ltr" className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground">
              AI ACADEMIC ADVISOR
            </span>
          )}
        </span>
      </span>
    </span>
  )
}

/** "Masari" wordmark with the orange full stop (masari-wordmark-*.svg). Latin only by design. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span lang="en" dir="ltr" translate="no" className={cn("font-bold tracking-[-0.03em] text-brand-ink", className)}>
      Masari<span className="text-brand-accent">.</span>
    </span>
  )
}

/**
 * Simplified circular icon for small sizes (masari-chat-avatar.svg / -orange.svg).
 * Inline so it stays crisp; the charcoal disc stays charcoal in both themes, like the export.
 */
export function AppIcon({ className, tone = "charcoal" }: { className?: string; tone?: "charcoal" | "orange" }) {
  const orange = tone === "orange"
  const ink = orange ? "#1E2230" : "#FFFFFF"
  return (
    <svg viewBox="0 0 100 100" className={cn("shrink-0", className)} aria-hidden>
      <circle cx="50" cy="50" r="50" fill={orange ? "#F27A2E" : "#1E2230"} />
      <g transform="translate(19 19) scale(0.62)">
        <path d={MARK_PATH} fill="none" stroke={ink} strokeWidth="10" strokeLinecap="round" />
        <circle cx="24" cy="76" r="10" fill={ink} />
        <circle cx="50" cy="50" r="10" fill={ink} />
        <circle cx="76" cy="24" r="14" fill={orange ? "#FFFFFF" : "#F27A2E"} />
      </g>
    </svg>
  )
}
