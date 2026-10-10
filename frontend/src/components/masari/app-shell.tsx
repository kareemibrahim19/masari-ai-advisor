"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import * as React from "react"
import { CalendarRange, Languages, LayoutDashboard, Library, LogOut, MessageSquareText, Moon, Sparkles, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Lockup } from "@/components/masari/brand"
import { DemoStateProvider } from "@/lib/demo-state"
import { type DictKey, useI18n } from "@/lib/i18n"
import { useStudent, useStudentView } from "@/lib/student-context"
import { cn } from "@/lib/utils"
import { createStoredValue } from "@/lib/use-stored"

const nav: { href: string; key: DictKey; short: DictKey; icon: React.ComponentType<{ className?: string }> }[] = [
  { href: "/", key: "navDashboard", short: "navDashboard", icon: LayoutDashboard },
  { href: "/chat", key: "navChat", short: "navChatShort", icon: MessageSquareText },
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

/** Desktop: horizontal tabs in the top bar. The active tab is marked by an orange rule, like the logo's destination dot. */
function TopNav() {
  const pathname = usePathname()
  const { t } = useI18n()
  return (
    <nav aria-label={t("mainNav")} className="hidden h-full items-stretch gap-1 lg:flex">
      {nav.map(({ href, key, short, icon: Icon }) => {
        const active = isActive(href, pathname)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-1.5 rounded-lg px-2 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring xl:gap-2 xl:px-2.5 2xl:px-3",
              "after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors",
              active ? "text-foreground after:bg-brand-accent" : "text-muted-foreground after:bg-transparent hover:text-foreground"
            )}
          >
            <Icon className="size-[17px]" aria-hidden />
            <span className="2xl:hidden">{t(short)}</span>
            <span className="hidden 2xl:inline">{t(key)}</span>
          </Link>
        )
      })}
    </nav>
  )
}

/** Mobile: bottom tab bar (5 items), thumb-reachable on a phone. */
function BottomNav() {
  const pathname = usePathname()
  const { t } = useI18n()
  return (
    <nav
      aria-label={t("mainNav")}
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/92 backdrop-blur supports-backdrop-filter:bg-background/80 lg:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-5">
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
                <span
                  className={cn(
                    "absolute top-0 h-0.5 w-8 rounded-b-full transition-colors",
                    active ? "bg-brand-accent" : "bg-transparent"
                  )}
                  aria-hidden
                />
                <Icon className="size-5" aria-hidden />
                <span className="max-w-full truncate px-1">{t(short)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function StudentChip() {
  const { tr, num, t, lang } = useI18n()
  const { student } = useStudentView()
  const full = tr(student.fullName)
  // The header shows the first two names; the full name is in the tooltip and on the dashboard.
  const short = full.split(/\s+/).slice(0, 2).join(" ")
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2.5 ps-1 sm:ps-2" aria-label={t("studentProfile")} title={full}>
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground">
        {full.charAt(0)}
      </span>
      <span className="hidden leading-tight whitespace-nowrap sm:block">
        <span className="block text-sm font-medium">{short}</span>
        <span className="block text-xs text-muted-foreground tabular">
          {tr(student.level)}{lang === "ar" ? "، " : ", "}GPA {student.gpa === null ? "—" : num(student.gpa, { minimumFractionDigits: 1 })}
        </span>
      </span>
    </div>
  )
}

/**
 * Frame around every page, and the login gate: /login renders on its own; every other page needs a
 * signed-in student and sends visitors without one to /login.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { ready, view } = useStudent()
  const isLogin = pathname === "/login"

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
            <Lockup size="sm" symbolOnlyOnMobile />
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
            <Button variant="ghost" size="icon-lg" className="size-10" onClick={toggle} aria-label={t("toggleTheme")}>
              {dark ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
            </Button>
            <StudentChip />
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-10"
              onClick={() => {
                signOut()
                router.replace("/login")
              }}
              aria-label={t("signOut")}
              title={t("signOut")}
            >
              <LogOut className="size-[18px] rtl:-scale-x-100" aria-hidden />
            </Button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] outline-none lg:pb-0">
        {children}
      </main>

      <BottomNav />
    </div>
  )
}
