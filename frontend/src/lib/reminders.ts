"use client"

/**
 * Reminders for the academic calendar's dates (lib/academic-calendar.ts):
 * - from 5 days before an event, an academic alert on the dashboard that turns redder as the day nears;
 * - from 3 days before, a popup when the student opens the site, which only the student can close.
 */
import * as React from "react"
import { calendarEvents, type CalendarEvent } from "@/lib/academic-calendar"
import type { L } from "@/lib/i18n"

export const ALERT_DAYS = 5
export const POPUP_DAYS = 3

/** Today as YYYY-MM-DD in the student's time zone. `masari.today` in localStorage overrides it for demos. */
function todayIso() {
  try {
    const forced = localStorage.getItem("masari.today")
    if (forced && /^\d{4}-\d{2}-\d{2}$/.test(forced)) return forced
  } catch {}
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const noop = () => () => {}

/** Today's date, or null while rendering on the server (so the prerendered HTML never holds a stale date). */
export function useToday(): string | null {
  return React.useSyncExternalStore(noop, todayIso, () => null)
}

const toDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

const daysBetween = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000)

const locale = (lang: "ar" | "en") => (lang === "ar" ? "ar-EG-u-nu-latn" : "en-US")

/** "الأحد، 11 أكتوبر 2026" / "Sunday, October 11, 2026". */
export const formatLongDate = (iso: string, lang: "ar" | "en") =>
  new Intl.DateTimeFormat(locale(lang), { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(toDate(iso))

const formatDayMonth = (iso: string, lang: "ar" | "en") =>
  new Intl.DateTimeFormat(locale(lang), { weekday: "long", day: "numeric", month: "long" }).format(toDate(iso))

export type Reminder = {
  event: CalendarEvent
  daysLeft: number
  /** 3 = today or tomorrow (strong red), 2 = in 2–3 days, 1 = in 4–5 days. */
  urgency: 1 | 2 | 3
  /** "in 3 days" style phrase. */
  when: L
  /** Full sentence for the alert body. */
  body: L
}

function whenPhrase(n: number): L {
  if (n === 0) return { ar: "النهاردة", en: "today" }
  if (n === 1) return { ar: "بكرة", en: "tomorrow" }
  if (n === 2) return { ar: "كمان يومين", en: "in 2 days" }
  return { ar: `كمان ${n} أيام`, en: `in ${n} days` }
}

/** Calendar events from today up to `within` days ahead, soonest first. */
export function upcomingReminders(today: string, within = ALERT_DAYS): Reminder[] {
  return calendarEvents
    .map((event) => ({ event, daysLeft: daysBetween(today, event.date) }))
    .filter((x) => x.daysLeft >= 0 && x.daysLeft <= within)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .map(({ event, daysLeft }) => {
      const when = whenPhrase(daysLeft)
      const time = event.time ? { ar: ` ${event.time.ar}`, en: ` ${event.time.en}` } : { ar: "", en: "" }
      const left: L =
        daysLeft === 0
          ? { ar: "ده آخر يوم، متأجلش.", en: "This is the last day, don't put it off." }
          : daysLeft === 1
            ? { ar: "فاضل يوم واحد بس.", en: "Only one day left." }
            : { ar: `لسه فاضل ${daysLeft === 2 ? "يومين" : `${daysLeft} أيام`}.`, en: `${daysLeft} days left.` }
      return {
        event,
        daysLeft,
        urgency: daysLeft <= 1 ? 3 : daysLeft <= POPUP_DAYS ? 2 : 1,
        when,
        body: {
          ar: `على فكرة: ${daysLeft <= 1 ? `${when.ar}، ` : "يوم "}${formatDayMonth(event.date, "ar")}${time.ar}: ${event.title.ar}. ${left.ar}`,
          en: `Heads up: ${daysLeft <= 1 ? `${when.en}, ` : "on "}${formatDayMonth(event.date, "en")}${time.en}: ${event.title.en}. ${left.en}`,
        },
      } satisfies Reminder
    })
}

// ---------------------------------------------------------------- popup dismissals

/** A popup the student closed stays closed for that event until the number of days left changes. */
const dismissKey = (r: Reminder) => `masari.reminder.${r.event.id}.${r.daysLeft}`

export function isDismissed(r: Reminder) {
  try {
    return localStorage.getItem(dismissKey(r)) === "1"
  } catch {
    return false
  }
}

export function dismiss(reminders: Reminder[]) {
  try {
    reminders.forEach((r) => localStorage.setItem(dismissKey(r), "1"))
  } catch {}
}
