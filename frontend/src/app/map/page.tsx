"use client"

/**
 * The campus map page, opened in the same tab from the header button and from rooms on the timetable/chat
 * (?room=308). A signed-in student sees it inside the app (header and nav stay, so going back is one tap); it needs
 * no sign-in, though: it shows the buildings, not anything about the student, so a shared link opens on its own.
 */
import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Lockup } from "@/components/masari/brand"
import { CampusMap } from "@/components/masari/campus-map"
import { useI18n } from "@/lib/i18n"
import { useStudent } from "@/lib/student-context"

function MapPage() {
  const { t } = useI18n()
  const { view } = useStudent()
  const room = useSearchParams().get("room") ?? undefined
  // inside the app the shell's header already has the logo, and its <main>
  const Wrap = view ? "div" : "main"
  return (
    <Wrap className="mx-auto w-full max-w-7xl pb-6">
      <header className="flex items-center gap-3 px-4 py-4">
        {!view && (
          <Link href="/" aria-label={t("appName")} className="shrink-0 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring">
            <Lockup size="sm" />
          </Link>
        )}
        <h1 className="text-lg font-semibold">{t("mapOpen")}</h1>
      </header>
      {/* keyed by room, so a new room link starts a fresh walk */}
      <CampusMap key={room ?? ""} room={room} />
    </Wrap>
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
