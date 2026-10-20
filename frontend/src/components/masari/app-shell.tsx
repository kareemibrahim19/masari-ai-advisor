"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import * as React from "react"
import { CalendarClock, CalendarRange, Languages, LayoutDashboard, Library, LogOut, MessageSquareText, Moon, Sparkles, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GoodbyeSplash, WelcomeSplash } from "@/components/masari/welcome-bot"
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

type Rule = { x: number; w: number; slide: boolean }

/**
 * Places one orange rule under the active tab of a nav, so it slides to the new tab instead of jumping. `place` turns
 * the active link's box into the rule's left edge and width. It slides only when the page changes; a resize, a
 * language switch or the first paint just moves it. `place` must be a stable function (declared at module level).
 */
function useActiveRule(pathname: string, place: (link: HTMLElement) => { x: number; w: number }) {
  const navRef = React.useRef<HTMLElement>(null)
  const [rule, setRule] = React.useState<Rule | null>(null)
  const lastPath = React.useRef<string | null>(null)

  React.useLayoutEffect(() => {
    const navEl = navRef.current
    if (!navEl) return
    const measure = (slide: boolean) => {
      const link = navEl.querySelector<HTMLElement>('[aria-current="page"]')
      // A hidden nav (the other screen size) has no box; leave the rule where it is.
      if (link && !link.offsetWidth) return
      setRule((prev) => (link ? { ...place(link), slide: slide && prev !== null } : null))
    }
    measure(lastPath.current !== null && lastPath.current !== pathname)
    lastPath.current = pathname
    const ro = new ResizeObserver(() => measure(false))
    ro.observe(navEl)
    return () => ro.disconnect()
  }, [pathname, place])

  return { navRef, rule }
}

// Top bar: the rule spans the tab minus 12px each side, as the old per-tab underline did.
const placeTopRule = (link: HTMLElement) => ({ x: link.offsetLeft + 12, w: link.offsetWidth - 24 })
// Bottom bar: a 32px rule centred over the active tab's column.
const placeBottomRule = (link: HTMLElement) => ({ x: link.offsetLeft + (link.offsetWidth - 32) / 2, w: 32 })

/** Desktop: horizontal tabs in the top bar. The active tab is marked by an orange rule, like the logo's destination dot. */
function TopNav() {
  const pathname = usePathname()
  const { t, lang } = useI18n()
  const { navRef, rule } = useActiveRule(pathname, placeTopRule)
  // Full tab names only where every tab still fits on one line: Arabic on 2xl screens. The English names are longer,
  // so English keeps the short ones and the bar never scrolls sideways.
  const longNames = lang === "ar"
  return (
    <nav ref={navRef} aria-label={t("mainNav")} className="relative hidden h-full items-stretch gap-1 lg:flex">
      {nav.map(({ href, key, short, icon: Icon }) => {
        const active = isActive(href, pathname)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-1.5 rounded-lg px-2 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring xl:gap-2 xl:px-2.5",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-[17px]" aria-hidden />
            <span className={cn(longNames && "2xl:hidden")}>{t(short)}</span>
            {longNames && <span className="hidden 2xl:inline">{t(key)}</span>}
          </Link>
        )
      })}
      <ActiveRule rule={rule} className="-bottom-px rounded-full" />
    </nav>
  )
}

function ActiveRule({ rule, className }: { rule: Rule | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute left-0 h-0.5 bg-brand-accent transition-opacity",
        rule?.slide && "transition-[transform,width,opacity] duration-300 ease-out",
        rule ? "opacity-100" : "opacity-0",
        className
      )}
      style={rule ? { width: rule.w, transform: `translateX(${rule.x}px)` } : undefined}
    />
  )
}

/** Mobile: bottom tab bar (5 items), thumb-reachable on a phone. */
function BottomNav() {
  const pathname = usePathname()
  const { t } = useI18n()
  const { navRef, rule } = useActiveRule(pathname, placeBottomRule)
  return (
    <nav
      ref={navRef}
      aria-label={t("mainNav")}
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/92 backdrop-blur supports-backdrop-filter:bg-background/80 lg:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-xl grid-flow-col auto-cols-fr">
        {nav.map(({ href, short, icon: Icon }) => {
          const active = isActive(href, pathname)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium outline-none focus-visible:bg-muted",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="max-w-full truncate px-1">{t(short)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
      <ActiveRule rule={rule} className="top-0 rounded-b-full" />
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

  React.useEffect(() => {
    if (ready && !view && !isLogin) router.replace("/login")
  }, [ready, view, isLogin, router])

  if (isLogin) return <>{children}</>
  if (!ready || !view) return null
  return (
    // Keyed by student, so selections, chat and scenarios start fresh for each student who signs in.
    <DemoStateProvider key={view.student.id}>
      <Shell>{children}</Shell>
    </DemoStateProvider>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang } = useI18n()
  const { dark, toggle } = useTheme()
  const { signOut } = useStudent()
  const router = useRouter()
  const pathname = usePathname()
  // Signing out: a full screen where the bot says goodbye and walks off, then the login page opens.
  const [leaving, setLeaving] = React.useState(false)
  const leave = React.useCallback(() => {
    signOut()
    router.replace("/login")
  }, [signOut, router])

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-4 focus:top-3"
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

      {/* Keyed by page, so each page fades in lightly as it arrives. */}
      <main
        key={pathname}
        id="main"
        tabIndex={-1}
        className="masari-page flex min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] outline-none lg:pb-0"
      >
        {children}
      </main>

      <BottomNav />
      <DeadlinePopup />
      <WelcomeSplash />
      {leaving && <GoodbyeSplash onGone={leave} />}
    </div>
  )
}
