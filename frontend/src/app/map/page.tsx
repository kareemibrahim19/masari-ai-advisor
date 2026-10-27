"use client"

/**
 * The campus map on its own page, opened in a new tab from the header button and from rooms on the timetable
 * (?room=308). It needs no sign-in: it shows the buildings, not anything about the student.
 */
import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Lockup } from "@/components/masari/brand"
import { CampusMap } from "@/components/masari/campus-map"
import { useI18n } from "@/lib/i18n"

function MapPage() {
  const { t } = useI18n()
  const room = useSearchParams().get("room") ?? undefined
  return (
    <main className="mx-auto w-full max-w-7xl pb-6">
      <header className="flex items-center gap-3 px-4 py-4">
        <Link href="/" aria-label={t("appName")} className="shrink-0 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring">
          <Lockup size="sm" />
        </Link>
        <h1 className="text-lg font-semibold">{t("mapOpen")}</h1>
      </header>
      {/* keyed by room, so a new timetable click in this tab starts a fresh walk */}
      <CampusMap key={room ?? ""} room={room} />
    </main>
  )
}

// useSearchParams needs a Suspense boundary so the page can still be built ahead of time.
export default function Page() {
  return (
    <React.Suspense>
      <MapPage />
    </React.Suspense>
  )
}
