"use client"

/**
 * Academic calendar: a small header button that opens the faculty's calendar image in a side panel.
 * Deliberately not a main tab; it is reference material, changed once a semester (lib/academic-calendar.ts).
 */
import { CalendarDays, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { academicCalendar } from "@/lib/academic-calendar"
import { useI18n } from "@/lib/i18n"

export function CalendarButton() {
  const { t, tr, dir } = useI18n()
  const title = `${t("academicCalendar")} · ${tr(academicCalendar.semester)} ${academicCalendar.academicYear}`
  return (
    <Sheet>
      <SheetTrigger
        render={<Button variant="ghost" size="icon-lg" className="size-10" aria-label={t("academicCalendar")} title={t("academicCalendar")} />}
      >
        <CalendarDays className="size-[18px]" aria-hidden />
      </SheetTrigger>
      {/* Opens from the side the button sits on (left in Arabic, right in English). */}
      <SheetContent side={dir === "rtl" ? "left" : "right"} className="overflow-y-auto data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-xl data-[side=right]:sm:max-w-xl">
        {/* pe-12 keeps the title clear of the close button in the corner. */}
        <SheetHeader className="pe-12">
          <SheetTitle>
            {t("academicCalendar")} · {tr(academicCalendar.semester)}{" "}
            {/* LTR island so "2026-2027" is never shown as "2027-2026" inside Arabic text. */}
            <bdi dir="ltr">{academicCalendar.academicYear}</bdi>
          </SheetTitle>
          <SheetDescription>{tr(academicCalendar.source)}</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          <a href={academicCalendar.image} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- a static file, also used by the static export */}
            <img src={academicCalendar.image} alt={title} className="block h-auto w-full" />
          </a>
          <a
            href={academicCalendar.image}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            <ExternalLink className="size-4" aria-hidden />
            {t("openFullSize")}
          </a>
        </div>
      </SheetContent>
    </Sheet>
  )
}
