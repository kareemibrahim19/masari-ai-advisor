"use client"

/**
 * Login (design "Concept A · Quiet card"). The access code is the student's ID from students.json;
 * it is checked through lib/data/student-source.ts, so the real backend can replace it later.
 * Visitors who are not signed in are sent here by the app shell.
 */
import { useRouter } from "next/navigation"
import * as React from "react"
import { AlertCircle, ArrowRight, Check, FlaskConical, Languages, Loader2, Lock, Moon, Sun } from "lucide-react"
import { AppIcon, Lockup } from "@/components/masari/brand"
import { useTheme } from "@/components/masari/app-shell"
import { demoAccessCode } from "@/lib/data/student-source"
import { type DictKey, useI18n } from "@/lib/i18n"
import { useStudent } from "@/lib/student-context"
import s from "./login.module.css"

const CODE_LENGTH = 9
const MIN_CHECK_MS = 600 // keep the "checking" state visible long enough to read
const REDIRECT_MS = 1300 // time to see the welcome before opening the dashboard

export default function LoginPage() {
  const { t, tr, lang, setLang } = useI18n()
  const { dark, toggle } = useTheme()
  const { view, signIn } = useStudent()
  const router = useRouter()
  const input = React.useRef<HTMLInputElement>(null)
  const [code, setCode] = React.useState("")
  const [error, setError] = React.useState<DictKey | null>(null)
  const [shake, setShake] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const [welcome, setWelcome] = React.useState<{ ar: string; en: string } | null>(null)
  /** True from submit on, so the redirect below does not cut the welcome message short. */
  const signingIn = React.useRef(false)

  // Already signed in (e.g. the back button): go straight to the dashboard.
  React.useEffect(() => {
    if (view && !signingIn.current) router.replace("/")
  }, [view, router])

  const fail = (key: DictKey) => {
    setError(key)
    setShake((n) => n + 1)
    input.current?.focus()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!code) return fail("loginErrEmpty")
    if (code.length < CODE_LENGTH) return fail("loginErrShort")
    setError(null)
    setBusy(true)
    signingIn.current = true
    const [student] = await Promise.all([signIn(code), new Promise((r) => setTimeout(r, MIN_CHECK_MS))])
    setBusy(false)
    if (!student) {
      signingIn.current = false
      return fail("loginErrWrong")
    }
    setWelcome({ ar: student.personal.name_ar.split(" ")[0], en: student.personal.name_en.split(" ")[0] })
    setTimeout(() => router.replace("/"), REDIRECT_MS)
  }

  const onChange = (v: string) => {
    setCode(v.replace(/\D/g, "").slice(0, CODE_LENGTH))
    setError(null)
  }

  return (
    <div className={s.page}>
      <header className={s.bar}>
        {/* Phones show the symbol only, as in the concept. */}
        <Lockup symbolOnlyOnMobile />
        <div className={s.tools}>
          <button
            type="button"
            className={s.tool}
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            aria-label={t("switchLangLabel")}
          >
            <Languages className={s.icon} aria-hidden />
            <span lang={lang === "ar" ? "en" : "ar"}>{t("switchLang")}</span>
          </button>
          <button type="button" className={`${s.tool} ${s.toolIcon}`} onClick={toggle} aria-label={t("toggleTheme")}>
            {dark ? <Sun className={s.icon} aria-hidden /> : <Moon className={s.icon} aria-hidden />}
          </button>
        </div>
      </header>

      <main className={s.stage} id="main">
        <svg className={s.watermark} viewBox="14 14 72 72" aria-hidden="true">
          <path d="M24 76 C24 58 50 66 50 50 C50 34 76 42 76 24" fill="none" strokeWidth="2.4" strokeLinecap="round" />
          <circle className={s.node} cx="24" cy="76" r="3.6" strokeWidth="2.4" />
          <circle className={s.node} cx="50" cy="50" r="3.6" strokeWidth="2.4" />
          <circle className={s.dest} cx="76" cy="24" r="5" />
        </svg>

        <section className={s.card} aria-labelledby="login-title">
          {welcome ? (
            <div className={s.success} role="status">
              <div className={s.okBadge}>
                <Check className={s.okIcon} aria-hidden />
              </div>
              <p className={s.okTitle}>
                {t("loginWelcome")} {tr(welcome)}
              </p>
              <p className={s.okSub}>{t("loginOkSub")}</p>
              <div className={s.okBar}>
                <i />
              </div>
            </div>
          ) : (
            <>
              <div className={s.head}>
                <AppIcon className={s.appIcon} />
                <h1 id="login-title" className={s.title}>
                  {t("loginTitle")}
                </h1>
                <p className={s.sub}>{t("loginSub")}</p>
              </div>

              <form className={s.form} noValidate onSubmit={submit}>
                <label className={s.label} htmlFor="code">
                  {t("loginLabel")}
                </label>
                <input
                  key={shake}
                  ref={input}
                  id="code"
                  name="code"
                  className={`${s.input} ${shake ? s.shake : ""}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  maxLength={CODE_LENGTH}
                  placeholder={"X".repeat(CODE_LENGTH)}
                  value={code}
                  onChange={(e) => onChange(e.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "code-msg" : undefined}
                  autoFocus
                />
                {error && (
                  <p className={s.msg} id="code-msg" role="alert">
                    <AlertCircle className={s.msgIcon} aria-hidden />
                    <span>{t(error)}</span>
                  </p>
                )}
                <button className={s.btn} type="submit" aria-busy={busy || undefined}>
                  {busy ? (
                    <>
                      <Loader2 className={`${s.icon} ${s.spin}`} aria-hidden />
                      {t("loginChecking")}
                    </>
                  ) : (
                    <>
                      {t("loginCta")}
                      <ArrowRight className={`${s.icon} ${s.flip}`} aria-hidden />
                    </>
                  )}
                </button>
                <p className={s.demoRow}>
                  <span>{t("loginDemoHint")}</span>
                  <button
                    type="button"
                    className={s.demoCode}
                    aria-label={`${t("loginDemoFill")}: ${demoAccessCode}`}
                    onClick={() => {
                      onChange(demoAccessCode)
                      input.current?.focus()
                    }}
                  >
                    {demoAccessCode}
                  </button>
                </p>
              </form>

              <div className={s.divider} />
              <div className={s.notes}>
                <p>
                  <Lock className={s.noteIcon} aria-hidden />
                  <span>{t("loginPersonal")}</span>
                </p>
              </div>
            </>
          )}
        </section>
      </main>

      <footer className={s.foot}>
        <span className={s.demoPill}>
          <FlaskConical className={s.pillIcon} aria-hidden />
          {t("demoData")}
        </span>
        <span>{t("loginFooter")}</span>
      </footer>
    </div>
  )
}
