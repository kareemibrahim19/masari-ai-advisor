"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import * as React from "react"
import { CalendarClock, CalendarRange, Languages, LayoutDashboard, Library, LogOut, MessageSquareText, Moon, Sparkles, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GoodbyeSplash, useSplashDone, WelcomeSplash } from "@/components/masari/welcome-bot"
import { CalendarButton } from "@/components/masari/calendar-sheet"
import { DeadlinePopup } from "@/components/masari/deadline-popup"
import { Lockup } from "@/components/masari/brand"
import { DemoStateProvider } from "@/lib/demo-state"
import { type DictKey, useI18n } from "@/lib/i18n"
import { useStudent, useStudentView } from "@/lib/student-context"
import { cn } from "@/lib/utils"
import { createStoredValue } from "@/lib/use-stored"

const nav: { href: string; key: DictKey; short: DictKey; icon: React.ComponentType<{ className?: string }> }[] = [
  { href: "/", key: "navDashboard", short: "navDashboard", icon: LayoutDashboard },
  { href: "/chat", key: "navChat", short: "navChatShort", icon: MessageSquareText },
  { href: "/schedule", key: "navSchedule", short: "navScheduleShort", icon: CalendarClock },
  { href: "/recommendations", key: "navCourses", short: "navCoursesShort", icon: Sparkles },
  { href: "/plan", key: "navPlan", short: "navPlanShort", icon: CalendarRange },
  { href: "/catalog", key: "navCatalog", short: "navCatalogShort", icon: Library },
]

const isActive = (href: string, pathname: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href))

type Theme = "system" | "light" | "dark"
const useStoredTheme = createStoredValue<Theme>("masari.theme", "system", (v): v is Theme => ["system", "light", "dark"].includes(v))

/** Light/dark theme saved as masari.theme. Also used by the login page, which has no app shell. */
export function useTheme() {
  const [theme, setTheme] = useStoredTheme()
  const systemDark = React.useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-color-scheme: dark)")
      mq.addEventListener("change", cb)
      return () => mq.removeEventListener("change", cb)
    },
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false
  )
  const dark = theme === "dark" || (theme === "system" && systemDark)
  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
  }, [dark])
  return { dark, toggle: () => setTheme(dark ? "light" : "dark") }
}

// ---- The active-tab indicator ----
// It moves the moment a tab is clicked (not when the new page has loaded), gliding smoothly; the back edge trails
// the front one by a hair, so it reads as one soft motion rather than a jump.

/** The tab the student just clicked, until its page is the current one. */
let pendingHref: string | null = null
const pendingListeners = new Set<() => void>()
const setPending = (href: string | null) => {
  pendingHref = href
  pendingListeners.forEach((l) => l())
}
function useShownPath(pathname: string) {
  const pending = React.useSyncExternalStore(
    (cb) => {
      pendingListeners.add(cb)
      return () => pendingListeners.delete(cb)
    },
    () => pendingHref,
    () => null
  )
  React.useEffect(() => {
    if (pending && isActive(pending, pathname)) setPending(null)
  }, [pending, pathname])
  return pending ?? pathname
}
/** Link onClick: a plain click starts the move at once (a new-tab click does not). */
const choose = (href: string) => (e: React.MouseEvent) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  setPending(href)
}

/** The shown tab's box inside its nav (px from the nav's left edge), the nav's width, and which way it just moved. */
type TabBox = { x: number; w: number; nav: number; move: -1 | 0 | 1 }

function useTabBox(shownPath: string) {
  const navRef = React.useRef<HTMLElement>(null)
  const [box, setBox] = React.useState<TabBox | null>(null)
  React.useLayoutEffect(() => {
    const navEl = navRef.current
    if (!navEl) return
    const measure = (animate: boolean) => {
      const href = nav.find((n) => isActive(n.href, shownPath))?.href
      const link = href ? navEl.querySelector<HTMLElement>(`[data-href="${href}"]`) : null
      // A hidden nav (the other screen size) has no box; leave it where it is.
      if (link && !link.offsetWidth) return
      setBox((prev) => {
        if (!link) return null
        const x = link.offsetLeft
        const w = link.offsetWidth
        const width = navEl.clientWidth
        // The observer also fires right after a click: nothing moved, so keep the slide that is under way.
        if (prev && prev.x === x && prev.w === w && prev.nav === width) return prev
        const move = animate && prev && x !== prev.x ? (x > prev.x ? 1 : -1) : 0
        return { x, w, nav: width, move }
      })
    }
    measure(true)
    const ro = new ResizeObserver(() => measure(false))
    ro.observe(navEl)
    return () => ro.disconnect()
  }, [shownPath])
  return { navRef, box }
}

/**
 * Something drawn over the shown tab, `inset` px in from each side, positioned by its left and right edges so each can
 * be timed on its own: the edge on the side it is heading to leads very slightly, the other follows just behind.
 */
function Stretchy({ box, inset, className }: { box: TabBox | null; inset: (w: number) => number; className?: string }) {
  if (!box) return <span aria-hidden className={cn("pointer-events-none absolute opacity-0", className)} />
  const i = inset(box.w)
  const lead = box.move > 0 ? "right" : "left"
  const trail = box.move > 0 ? "left" : "right"
  const ease = "cubic-bezier(0.45, 0, 0.2, 1)" // eases in and out: no snap at the start
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute", className)}
      style={{
        left: box.x + i,
        right: box.nav - (box.x + box.w) + i,
        transition: box.move ? `${lead} 230ms ${ease}, ${trail} 260ms ${ease} 15ms` : "none",
      }}
    />
  )
}

/** Desktop: horizontal tabs in the top bar. The active tab is marked by a soft box and an orange rule under it. */
function TopNav() {
  const pathname = usePathname()
  const shown = useShownPath(pathname)
  const { t, lang } = useI18n()
  const { navRef, box } = useTabBox(shown)
  // Full tab names only where every tab still fits on one line: Arabic on 2xl screens. The English names are longer,
  // so English keeps the short ones and the bar never scrolls sideways.
  const longNames = lang === "ar"
  return (
    <nav ref={navRef} aria-label={t("mainNav")} className="relative hidden h-full items-stretch gap-1 lg:flex">
      {nav.map(({ href, key, short, icon: Icon }) => {
        const on = isActive(href, shown)
        return (
          <Link
            key={href}
            href={href}
            data-href={href}
            onClick={choose(href)}
            aria-current={isActive(href, pathname) ? "page" : undefined}
            className={cn(
              "group relative z-10 flex items-center gap-1.5 rounded-lg px-2 text-sm font-medium whitespace-nowrap transition-colors duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring xl:gap-2 xl:px-2.5",
              on ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {/* Re-keyed when the tab becomes the shown one, so its icon pops once. */}
            <Icon key={on ? "on" : "off"} className={cn("masari-tab-icon size-[17px]", on && "masari-tab-pop")} aria-hidden />
            <span className={cn(longNames && "2xl:hidden")}>{t(short)}</span>
            {longNames && <span className="hidden 2xl:inline">{t(key)}</span>}
          </Link>
        )
      })}
      <Stretchy box={box} inset={() => 0} className="top-1/2 h-9 -translate-y-1/2 rounded-lg bg-muted" />
      <Stretchy box={box} inset={() => 10} className="-bottom-px h-0.5 rounded-full bg-brand-accent" />
    </nav>
  )
}

/** Mobile: bottom tab bar, thumb-reachable on a phone. A 32px rule over the shown tab. */
function BottomNav() {
  const pathname = usePathname()
  const shown = useShownPath(pathname)
  const { t } = useI18n()
  const { navRef, box } = useTabBox(shown)
  return (
    <nav
      ref={navRef}
      aria-label={t("mainNav")}
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/92 backdrop-blur supports-backdrop-filter:bg-background/80 lg:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-xl grid-flow-col auto-cols-fr">
        {nav.map(({ href, short, icon: Icon }) => {
          const on = isActive(href, shown)
          return (
            <li key={href}>
              <Link
                href={href}
                data-href={href}
                onClick={choose(href)}
                aria-current={isActive(href, pathname) ? "page" : undefined}
                className={cn(
                  "relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-200 outline-none focus-visible:bg-muted",
                  on ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <Icon key={on ? "on" : "off"} className={cn("masari-tab-icon size-5", on && "masari-tab-pop")} aria-hidden />
                <span className="max-w-full truncate px-1">{t(short)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
      <Stretchy box={box} inset={(w) => (w - 32) / 2} className="top-0 h-0.5 rounded-b-full bg-brand-accent" />
    </nav>
  )
}

function StudentChip() {
  const { tr, t } = useI18n()
  const { student } = useStudentView()
  const full = tr(student.fullName)
  // The header shows the first two names; the full name is in the tooltip and on the dashboard. Between lg and xl
  // the top bar also holds every tab, so the name gives way to the avatar there and the bar never scrolls sideways.
  const short = full.split(/\s+/).slice(0, 2).join(" ")
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2.5 ps-1 sm:ps-2" aria-label={t("studentProfile")} title={full}>
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground">
        {full.charAt(0)}
      </span>
      <span className="hidden leading-tight whitespace-nowrap sm:block lg:hidden xl:block">
        <span className="block text-sm font-medium">{short}</span>
        <span className="block text-xs text-muted-foreground tabular">{tr(student.level)}</span>
      </span>
    </div>
  )
}

/**
 * Frame around every page, and the login gate: /login and /activate (first sign-in) render on their own;
 * every other page needs a signed-in student and sends visitors without one to /login.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { ready, view } = useStudent()
  const isLogin = pathname === "/login" || pathname === "/activate"
  // Right after signing in, the hello screen comes on its own: the app (and its entrance animations) only mounts
  // once Masari has said hello and gone.
  const helloDone = useSplashDone()

  React.useEffect(() => {
    if (ready && !view && !isLogin) router.replace("/login")
  }, [ready, view, isLogin, router])

  if (isLogin) return <>{children}</>
  if (!ready || !view) return null
  if (!helloDone) return <WelcomeSplash />
  return (
    // Keyed by student, so selections, chat and scenarios start fresh for each student who signs in.
    <DemoStateProvider key={view.student.id}>
      <Shell>{children}</Shell>
    </DemoStateProvider>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang, dir } = useI18n()
  const { dark, toggle } = useTheme()
  const { signOut } = useStudent()
  const router = useRouter()
  const pathname = usePathname()
  // Signing out: a full screen where the bot says goodbye and walks off, then the login page opens.
  const [leaving, setLeaving] = React.useState(false)

  // The new page slides in from the side of the tab you came from (a later tab is further along: left in Arabic).
  const mainRef = React.useRef<HTMLElement>(null)
  const lastTab = React.useRef(-1)
  React.useLayoutEffect(() => {
    const tab = nav.findIndex((n) => isActive(n.href, pathname))
    const step = lastTab.current < 0 || tab < 0 ? 0 : Math.sign(tab - lastTab.current)
    mainRef.current?.style.setProperty("--page-from", `${step * (dir === "rtl" ? -24 : 24)}px`)
    lastTab.current = tab
  }, [pathname, dir])
  const leave = React.useCallback(() => {
    signOut()
    router.replace("/login")
  }, [signOut, router])

  // Signing out: the goodbye screen replaces the app (nothing keeps running behind it), then the login page opens.
  if (leaving) return <GoodbyeSplash onGone={leave} />
  return (
    // overflow-x-clip: the page's entrance slide (24px) and hidden helpers never widen the page, so phones can't pan
    // it sideways (clip, unlike hidden, keeps the sticky header working).
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-primary focus:px-4 focus:py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-4 focus:top-3"
      >
        {t("skipToContent")}
      </a>

      <header className="sticky top-0 z-30 border-b bg-background/88 backdrop-blur supports-backdrop-filter:bg-background/75">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 md:px-6 lg:gap-4 xl:gap-6">
          <Link href="/" aria-label={t("appName")} className="shrink-0 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring">
            <Lockup size="sm" />
          </Link>

          <TopNav />

          <div className="ms-auto flex items-center gap-0.5 sm:gap-1">
            <Button
              variant="ghost"
              className="h-10 gap-1.5 px-3"
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              lang={lang === "ar" ? "en" : "ar"}
              aria-label={t("switchLangLabel")}
            >
              <Languages className="size-4" aria-hidden />
              <span className="hidden sm:inline lg:hidden xl:inline">{t("switchLang")}</span>
              <span className="sm:hidden lg:inline xl:hidden">{lang === "ar" ? "EN" : "ع"}</span>
            </Button>
            <CalendarButton />
            <Button variant="ghost" size="icon-lg" className="size-10" onClick={toggle} aria-label={t("toggleTheme")}>
              {dark ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
            </Button>
            <StudentChip />
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-10"
              disabled={leaving}
              onClick={() => {
                const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
                if (still) leave()
                else setLeaving(true)
              }}
              aria-label={t("signOut")}
              title={t("signOut")}
            >
              <LogOut className="size-[18px] rtl:-scale-x-100" aria-hidden />
            </Button>
          </div>
        </div>
      </header>

      {/* Keyed by page, so each page arrives with a short fade and slide (see .masari-page). */}
      <main
        ref={mainRef}
        key={pathname}
        id="main"
        tabIndex={-1}
        className="masari-page flex min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] outline-none lg:pb-0"
      >
        {children}
      </main>

      <BottomNav />
      <DeadlinePopup />
    </div>
  )
}
