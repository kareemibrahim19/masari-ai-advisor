"use client"

/**
 * First sign-in, for a student with no password yet (same card as /login). Step 1: student ID + national ID,
 * checked by the AI service (POST /api/auth/activate/check). Step 2: choose the password and type it again
 * (POST /api/auth/activate), which also signs the student in. Then the dashboard opens.
 */
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { AlertCircle, ArrowRight, Check, KeyRound, Languages, Loader2, Moon, Sun } from "lucide-react"
import { AppIcon, Lockup } from "@/components/masari/brand"
import { useTheme } from "@/components/masari/app-shell"
import { activateCheck } from "@/lib/auth"
import { type DictKey, useI18n } from "@/lib/i18n"
import { useStudent } from "@/lib/student-context"
import s from "../login/login.module.css"
import { PasswordField } from "../login/password-field"

const CODE_LENGTH = 9
const NATIONAL_ID_LENGTH = 14
const MIN_PASSWORD = 8 // the server's rule (ai/db/accounts.py MIN_LENGTH)
const MIN_CHECK_MS = 600
const REDIRECT_MS = 1800

type Step = { kind: "identity" } | { kind: "password"; token: string; name: { ar: string; en: string } } | { kind: "done" }

export default function ActivatePage() {
  const { t, tr, lang, setLang } = useI18n()
  const { dark, toggle } = useTheme()
  const { view, activate } = useStudent()
  const router = useRouter()
  const [step, setStep] = React.useState<Step>({ kind: "identity" })
  const [code, setCode] = React.useState("")
  const [nid, setNid] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [again, setAgain] = React.useState("")
  const [error, setError] = React.useState<DictKey | null>(null)
  const [shake, setShake] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const codeInput = React.useRef<HTMLInputElement>(null)
  const nidInput = React.useRef<HTMLInputElement>(null)
  const passwordInput = React.useRef<HTMLInputElement>(null)
  const againInput = React.useRef<HTMLInputElement>(null)
  /** True once the password is saved, so the redirect below does not cut the success message short. */
  const finishing = React.useRef(false)

  // Already signed in: nothing to activate.
  React.useEffect(() => {
    if (view && !finishing.current) router.replace("/")
  }, [view, router])

  // The shake re-creates the inputs (key), so the focus moves after that render.
  const focusNext = React.useRef<React.RefObject<HTMLInputElement | null> | null>(null)
  React.useEffect(() => {
    focusNext.current?.current?.focus()
  }, [shake, step.kind])

  const fail = (key: DictKey, focus: React.RefObject<HTMLInputElement | null>) => {
    setError(key)
    setShake((n) => n + 1)
    focusNext.current = focus
  }

  const check = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!code) return fail("loginErrEmpty", codeInput)
    if (code.length < CODE_LENGTH) return fail("loginErrShort", codeInput)
    if (!nid) return fail("actErrNoNid", nidInput)
    if (nid.length < NATIONAL_ID_LENGTH) return fail("actErrNidShort", nidInput)
    setError(null)
    setBusy(true)
    const [result] = await Promise.all([activateCheck(code, nid), new Promise((r) => setTimeout(r, MIN_CHECK_MS))])
    setBusy(false)
    if (!result.ok) {
      const key = result.reason === "no_match" ? "actErrNoMatch" : result.reason === "too_many" ? "loginErrTooMany" : "loginErrUnavailable"
      return fail(key, nidInput)
    }
    setNid("") // not needed any more
    setStep({ kind: "password", token: result.activationToken, name: result.name })
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || step.kind !== "password") return
    if (password.length < MIN_PASSWORD) return fail("actErrShortPass", passwordInput)
    if (again !== password) return fail("actErrMismatch", againInput)
    setError(null)
    setBusy(true)
    finishing.current = true
    const [result] = await Promise.all([activate(step.token, password), new Promise((r) => setTimeout(r, MIN_CHECK_MS))])
    setBusy(false)
    if (!result.ok) {
      finishing.current = false
      if (result.reason === "expired") {
        setPassword("")
        setAgain("")
        setStep({ kind: "identity" })
        return fail("actErrExpired", nidInput)
      }
      const key = result.reason === "already" ? "actErrAlready" : result.reason === "short" ? "actErrShortPass" : "loginErrUnavailable"
      return fail(key, passwordInput)
    }
    setStep({ kind: "done" })
    setTimeout(() => router.replace("/"), REDIRECT_MS)
  }

  const errorLine = error && (
    <p className={s.msg} id="act-msg" role="alert">
      <AlertCircle className={s.msgIcon} aria-hidden />
      <span>{t(error)}</span>
    </p>
  )
  const submitLabel = (idle: DictKey, working: DictKey) =>
    busy ? (
      <>
        <Loader2 className={`${s.icon} ${s.spin}`} aria-hidden />
        {t(working)}
      </>
    ) : (
      <>
        {t(idle)}
        <ArrowRight className={`${s.icon} ${s.flip}`} aria-hidden />
      </>
    )

  return (
    <div className={s.page}>
      <header className={s.bar}>
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
        <section className={s.card} aria-labelledby="act-title">
          {step.kind === "done" ? (
            <div className={s.success} role="status">
              <div className={s.okBadge}>
                <Check className={s.okIcon} aria-hidden />
              </div>
              <p className={s.okTitle} id="act-title">
                {t("actOkTitle")}
              </p>
              <p className={s.okSub}>{t("actOkSub")}</p>
              <div className={s.okBar}>
                <i />
              </div>
            </div>
          ) : step.kind === "identity" ? (
            <>
              <div className={s.head}>
                <AppIcon className={s.appIcon} />
                <h1 id="act-title" className={s.title}>
                  {t("actTitle")}
                </h1>
                <p className={s.sub}>{t("actSub")}</p>
              </div>

              <form className={s.form} noValidate onSubmit={check}>
                <label className={s.label} htmlFor="code">
                  {t("loginLabel")}
                </label>
                <input
                  key={`code-${shake}`}
                  ref={codeInput}
                  id="code"
                  name="code"
                  className={`${s.input} ${shake && error?.startsWith("login") ? s.shake : ""}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="username"
                  spellCheck={false}
                  maxLength={CODE_LENGTH}
                  placeholder={"X".repeat(CODE_LENGTH)}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))
                    setError(null)
                  }}
                  aria-invalid={error === "loginErrEmpty" || error === "loginErrShort" ? true : undefined}
                  aria-describedby={error ? "act-msg" : undefined}
                  autoFocus
                />
                <div className={s.gap} />
                <label className={s.label} htmlFor="nid">
                  {t("actNationalId")}
                </label>
                <input
                  key={`nid-${shake}`}
                  ref={nidInput}
                  id="nid"
                  name="nid"
                  className={`${s.input} ${shake && error?.startsWith("act") ? s.shake : ""}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={NATIONAL_ID_LENGTH}
                  placeholder={"X".repeat(NATIONAL_ID_LENGTH)}
                  value={nid}
                  onChange={(e) => {
                    setNid(e.target.value.replace(/\D/g, "").slice(0, NATIONAL_ID_LENGTH))
                    setError(null)
                  }}
                  aria-invalid={error?.startsWith("act") ? true : undefined}
                  aria-describedby={error ? "act-msg" : undefined}
                  style={{ fontSize: 18, letterSpacing: "0.12em" }}
                />
                {errorLine}
                <button className={s.btn} type="submit" aria-busy={busy || undefined}>
                  {submitLabel("actCheckCta", "loginChecking")}
                </button>
              </form>
              <p className={s.alt}>
                {t("actHaveAccount")}
                <Link href="/login">{t("actBackToLogin")}</Link>
              </p>

              <div className={s.divider} />
              <div className={s.notes}>
                <p>
                  <KeyRound className={s.noteIcon} aria-hidden />
                  <span>{t("actNidNote")}</span>
                </p>
              </div>
            </>
          ) : (
            <>
              <div className={s.head}>
                <AppIcon className={s.appIcon} />
                <h1 id="act-title" className={s.title}>
                  {t("loginWelcome")} {tr(step.name).split(" ")[0]}
                </h1>
                <p className={s.sub}>{t("actPassSub")}</p>
              </div>

              <form className={s.form} noValidate onSubmit={save}>
                {/* The id, hidden, so the browser's password manager saves the new password under it. */}
                <input type="text" name="username" autoComplete="username" value={code} readOnly hidden />
                <label className={s.label} htmlFor="password">
                  {t("actNewPassword")}
                </label>
                <PasswordField
                  shakeKey={`pw-${shake}`}
                  ref={passwordInput}
                  id="password"
                  name="password"
                  className={shake && error !== "actErrMismatch" ? s.shake : ""}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError(null)
                  }}
                  aria-invalid={error === "actErrShortPass" ? true : undefined}
                  aria-describedby="pw-hint"
                  autoFocus
                />
                <p className={s.hint} id="pw-hint">
                  {t("actMinHint")}
                </p>
                <div className={s.gap} />
                <label className={s.label} htmlFor="again">
                  {t("actConfirmPassword")}
                </label>
                <PasswordField
                  shakeKey={`again-${shake}`}
                  ref={againInput}
                  id="again"
                  name="again"
                  className={shake && error === "actErrMismatch" ? s.shake : ""}
                  autoComplete="new-password"
                  value={again}
                  onChange={(e) => {
                    setAgain(e.target.value)
                    setError(null)
                  }}
                  aria-invalid={error === "actErrMismatch" ? true : undefined}
                  aria-describedby={error ? "act-msg" : undefined}
                />
                {errorLine}
                <button className={s.btn} type="submit" aria-busy={busy || undefined}>
                  {submitLabel("actSaveCta", "actSaving")}
                </button>
              </form>
            </>
          )}
        </section>
      </main>

      <footer className={s.foot}>
        <span>{t("loginFooter")}</span>
      </footer>
    </div>
  )
}
