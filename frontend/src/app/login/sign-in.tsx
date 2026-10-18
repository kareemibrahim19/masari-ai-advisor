"use client"

/**
 * Sign in and first sign-in on one screen (design "Masari Sign-in"). /login and /activate both render it; the tabs
 * switch between them in place (the address follows with history.replaceState), so the card keeps its size.
 *
 * Sign in: student ID + password (POST /api/auth/login). First time: student ID + national ID
 * (POST /api/auth/activate/check), then a new password typed twice (POST /api/auth/activate), which also signs in.
 * Once signed in the dashboard opens straight away. The logo's path beside the card fills in as the student types.
 */
import { useRouter } from "next/navigation"
import * as React from "react"
import { Eye, EyeOff, Moon, Sun } from "lucide-react"
import { Lockup } from "@/components/masari/brand"
import { useTheme } from "@/components/masari/app-shell"
import { activateCheck } from "@/lib/auth"
import { type DictKey, useI18n } from "@/lib/i18n"
import { useStudent } from "@/lib/student-context"
import s from "./login.module.css"

export type SignInMode = "login" | "activate"
type Step = { kind: "identity" } | { kind: "password"; token: string; name: { ar: string; en: string } }

const CODE_LENGTH = 9
const NATIONAL_ID_LENGTH = 14
const PATH_OF: Record<SignInMode, string> = { login: "/login", activate: "/activate" }
const SHAKE = [0, -10, 9, -6, 5, -2, 0].map((x) => ({ transform: `translateX(${x}px)` }))

/** Egyptian national ID: century digit (2 = 1900s, 3 = 2000s) then YYMMDD. Null until the date is typed. */
function birthDate(nid: string): { date: string } | { bad: true } | null {
  if (nid.length < 7) return null
  const century = nid[0] === "2" ? 1900 : nid[0] === "3" ? 2000 : 0
  if (!century) return { bad: true }
  const y = century + Number(nid.slice(1, 3))
  const m = Number(nid.slice(3, 5))
  const d = Number(nid.slice(5, 7))
  const dt = new Date(y, m - 1, d)
  if (m < 1 || m > 12 || dt.getDate() !== d || y > new Date().getFullYear() - 10) return { bad: true }
  return { date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` }
}

const passwordRules = (p: string) => [p.length >= 8, /[A-Za-z؀-ۿ]/.test(p), /\d/.test(p)]

export function SignIn({ initial }: { initial: SignInMode }) {
  const { t, tr, lang, setLang } = useI18n()
  const { dark, toggle } = useTheme()
  const { view, signIn, activate } = useStudent()
  const router = useRouter()

  const [mode, setMode] = React.useState<SignInMode>(initial)
  const [step, setStep] = React.useState<Step>({ kind: "identity" })
  const [code, setCode] = React.useState("")
  const [nid, setNid] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [again, setAgain] = React.useState("")
  const [shown, setShown] = React.useState(false)
  const [caps, setCaps] = React.useState(false)
  const [focus, setFocus] = React.useState<"code" | "nid" | "pw" | null>(null)
  const [error, setError] = React.useState<DictKey | null>(null)
  const [busy, setBusy] = React.useState(false)

  const card = React.useRef<HTMLElement>(null)
  const loginCode = React.useRef<HTMLInputElement>(null)
  const loginPw = React.useRef<HTMLInputElement>(null)
  const actCode = React.useRef<HTMLInputElement>(null)
  const actNid = React.useRef<HTMLInputElement>(null)
  const newPw = React.useRef<HTMLInputElement>(null)
  const againPw = React.useRef<HTMLInputElement>(null)

  // Signed in (just now, or already, e.g. the back button): straight to the dashboard.
  React.useEffect(() => {
    if (view) router.replace("/")
  }, [view, router])

  const isLogin = mode === "login"
  const choosing = !isLogin && step.kind === "password"
  const done = !!view

  // The form in front gets the focus whenever it changes.
  React.useEffect(() => {
    ;(isLogin ? (code.length === CODE_LENGTH ? loginPw : loginCode) : choosing ? newPw : actCode).current?.focus()
    // Only when the form changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLogin, choosing])

  const switchTo = (m: SignInMode) => {
    if (m === mode) return
    setMode(m)
    setStep({ kind: "identity" })
    setError(null)
    setPassword("")
    setAgain("")
    setNid("")
    window.history.replaceState(null, "", PATH_OF[m])
  }

  const fail = (key: DictKey, field: React.RefObject<HTMLInputElement | null>) => {
    setError(key)
    field.current?.focus()
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      card.current?.animate(SHAKE, { duration: 360, easing: "ease-out" })
  }

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!code) return fail("loginErrEmpty", loginCode)
    if (code.length < CODE_LENGTH) return fail("loginErrShort", loginCode)
    if (!password) return fail("loginErrNoPassword", loginPw)
    setError(null)
    setBusy(true)
    const result = await signIn(code, password)
    setBusy(false)
    if (!result.ok) {
      setPassword("")
      const key = result.reason === "wrong" ? "loginErrWrong" : result.reason === "too_many" ? "loginErrTooMany" : "loginErrUnavailable"
      return fail(key, result.reason === "wrong" ? loginPw : loginCode)
    }
    // view is set now; the effect above opens the dashboard.
  }

  const submitCheck = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!code) return fail("loginErrEmpty", actCode)
    if (code.length < CODE_LENGTH) return fail("loginErrShort", actCode)
    if (!nid) return fail("actErrNoNid", actNid)
    if (nid.length < NATIONAL_ID_LENGTH) return fail("actErrNidShort", actNid)
    const born = birthDate(nid)
    if (!born || "bad" in born) return fail("actErrNidBad", actNid)
    setError(null)
    setBusy(true)
    const result = await activateCheck(code, nid)
    setBusy(false)
    if (!result.ok) {
      const key = result.reason === "no_match" ? "actErrNoMatch" : result.reason === "too_many" ? "loginErrTooMany" : "loginErrUnavailable"
      return fail(key, actNid)
    }
    setNid("") // not needed any more
    setStep({ kind: "password", token: result.activationToken, name: result.name })
  }

  const submitSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || step.kind !== "password") return
    if (!passwordRules(password).every(Boolean)) return fail("actErrRules", newPw)
    if (again !== password) return fail("actErrMismatch", againPw)
    setError(null)
    setBusy(true)
    const result = await activate(step.token, password)
    setBusy(false)
    if (!result.ok) {
      if (result.reason === "expired") {
        setPassword("")
        setAgain("")
        setStep({ kind: "identity" })
        return fail("actErrExpired", actNid)
      }
      const key = result.reason === "already" ? "actErrAlready" : result.reason === "short" ? "actErrShortPass" : "loginErrUnavailable"
      return fail(key, newPw)
    }
  }

  const onCaps = (e: React.KeyboardEvent) => setCaps(e.getModifierState?.("CapsLock") ?? false)
  const onCode = (v: string) => {
    setCode(v.replace(/\D/g, "").slice(0, CODE_LENGTH))
    setError(null)
  }

  // ---- How far along the path is (0..1 for each half) ----
  const rules = passwordRules(password)
  const ruleCount = rules.filter(Boolean).length
  const match = again.length > 0 && again === password
  let p1: number, p2: number
  if (done) [p1, p2] = [1, 1]
  else if (isLogin) [p1, p2] = [code.length / CODE_LENGTH, code.length === CODE_LENGTH ? Math.min(1, password.length / 8) : 0]
  else if (!choosing) [p1, p2] = [(code.length + nid.length) / (CODE_LENGTH + NATIONAL_ID_LENGTH), 0]
  else [p1, p2] = [1, (ruleCount / 3) * 0.75 + (match ? 0.25 : 0)]
  const activeLabel = done ? 2 : p1 >= 1 ? 1 : 0
  const labels: [DictKey, DictKey][] = isLogin
    ? [["stageId", "stageIdSub"], ["stagePassword", "stagePasswordSub"], ["stageGoal", "stageGoalSub"]]
    : [["stageIdentity", "stageIdentitySub"], ["stageNewPassword", "stageNewPasswordSub"], ["stageGoal", "stageGoalSub"]]
  const labelAt = [
    { left: "17.5%", top: "89.5%" },
    { left: "67%", top: "57%" },
    { left: "82.5%", top: "-6.5%" },
  ]

  // ---- Pieces shared by the forms ----
  const born = birthDate(nid)
  const on = (v: boolean) => (v ? "" : undefined) // data-* flags
  const codeBad = error === "loginErrEmpty" || error === "loginErrShort"

  // The error takes the subtitle's place (same slot, same height), so the card never changes size.
  const subtitle = (key: DictKey, active: boolean) =>
    active && error ? (
      <p className={`${s.sub} ${s.error}`} role="alert">
        <b aria-hidden>!</b>
        <span>{t(error)}</span>
      </p>
    ) : (
      <p className={s.sub}>{t(key)}</p>
    )

  const cta = (idle: DictKey, working: DictKey) => (
    <button className={s.cta} type="submit" aria-busy={busy || undefined}>
      {busy && <span className={s.spinner} aria-hidden />}
      <span>{t(busy ? working : idle)}</span>
    </button>
  )

  const digits = (ref: React.RefObject<HTMLInputElement | null>, id: string, autoComplete: string) => (
    <div className={s.field}>
      <div className={s.labelRow}>
        <label className={s.label} htmlFor={id}>
          {t("loginLabel")}
        </label>
        <span className={s.count} dir="ltr">
          {code.length}/{CODE_LENGTH}
        </span>
      </div>
      <div className={s.digits} dir="ltr" data-bad={on(codeBad)}>
        <div className={s.boxes} aria-hidden>
          {Array.from({ length: CODE_LENGTH }, (_, i) => (
            <div
              key={i}
              className={s.box}
              data-filled={on(!!code[i])}
              data-current={on(focus === "code" && i === Math.min(code.length, CODE_LENGTH - 1))}
            >
              {code[i] ?? (focus === "code" && i === code.length ? "│" : "")}
            </div>
          ))}
        </div>
        <input
          ref={ref}
          id={id}
          name="username"
          className={s.digitsInput}
          type="text"
          inputMode="numeric"
          autoComplete={autoComplete}
          spellCheck={false}
          maxLength={CODE_LENGTH}
          value={code}
          onChange={(e) => onCode(e.target.value)}
          onFocus={() => setFocus("code")}
          onBlur={() => setFocus(null)}
          aria-invalid={codeBad || undefined}
        />
      </div>
    </div>
  )

  const passwordBox = (
    ref: React.RefObject<HTMLInputElement | null>,
    id: string,
    label: DictKey,
    value: string,
    set: (v: string) => void,
    opts: { autoComplete: string; bad?: boolean; mark?: boolean; toggle?: boolean }
  ) => (
    <div className={s.field}>
      <label className={`${s.label} ${s.labelAlone}`} htmlFor={id}>
        {t(label)}
      </label>
      <div className={s.pwBox} data-bad={on(!!opts.bad)} data-match={on(!!opts.mark && match)}>
        <input
          ref={ref}
          id={id}
          className={s.pwInput}
          type={shown ? "text" : "password"}
          dir="ltr"
          autoComplete={opts.autoComplete}
          value={value}
          onChange={(e) => {
            set(e.target.value)
            setError(null)
          }}
          onKeyDown={onCaps}
          onKeyUp={onCaps}
          onFocus={() => setFocus("pw")}
          onBlur={() => setFocus(null)}
          aria-invalid={opts.bad || undefined}
        />
        {opts.toggle && (
          <button
            type="button"
            className={s.pwToggle}
            onClick={() => setShown((v) => !v)}
            aria-pressed={shown}
            aria-label={t(shown ? "hidePassword" : "showPassword")}
            title={t(shown ? "hidePassword" : "showPassword")}
          >
            {shown ? <EyeOff className={s.eye} aria-hidden /> : <Eye className={s.eye} aria-hidden />}
          </button>
        )}
        {opts.mark && (
          <span className={s.mark} data-ok={on(match)} data-bad={on(again.length > 0 && !match)} aria-hidden>
            {again ? (match ? "✓" : "✕") : ""}
          </span>
        )}
      </div>
      {opts.toggle && caps && focus === "pw" && <div className={s.caps}>⇪ {t("capsLockOn")}</div>}
    </div>
  )

  const pane = (visible: boolean) => ({ "data-hidden": on(!visible), inert: !visible, "aria-hidden": !visible || undefined })

  return (
    <div className={s.page}>
      <header className={s.bar}>
        <Lockup />
        <div className={s.tools}>
          <button type="button" className={s.tool} onClick={() => setLang(lang === "ar" ? "en" : "ar")} aria-label={t("switchLangLabel")}>
            <span lang={lang === "ar" ? "en" : "ar"}>{t("switchLang")}</span>
          </button>
          <button type="button" className={`${s.tool} ${s.toolIcon}`} onClick={toggle} aria-label={t("toggleTheme")}>
            {dark ? <Sun className={s.icon} aria-hidden /> : <Moon className={s.icon} aria-hidden />}
          </button>
        </div>
      </header>

      <main className={s.main} id="main">
        <section className={s.stage} aria-hidden>
          <div className={s.stageBox}>
            <svg className={s.stageSvg} viewBox="10 10 80 80">
              <path className={s.track} d="M24 76 C24 58 50 66 50 50 C50 34 76 42 76 24" />
              <path className={s.drawn} d="M24 76 C24 58 50 66 50 50" pathLength={100} strokeDasharray={100} strokeDashoffset={100 - p1 * 100} />
              <path className={s.drawn} d="M50 50 C50 34 76 42 76 24" pathLength={100} strokeDasharray={100} strokeDashoffset={100 - p2 * 100} />
              <circle className={s.node} cx="24" cy="76" r="4.6" data-on={on(p1 > 0)} />
              <circle className={s.node} cx="50" cy="50" r="4.6" data-on={on(p1 >= 1)} />
              <circle className={s.goal} cx="76" cy="24" r="6.4" data-on={on(done)} data-near={on(p2 >= 1)} />
              {done && <circle className={s.pulse} cx="76" cy="24" r="6" />}
            </svg>
            {labels.map(([title, sub], i) => (
              <div key={title} className={s.stageLabel} style={labelAt[i]} data-on={on(i === activeLabel)} data-goal={on(i === 2)}>
                <b>{t(title)}</b>
                <span>{t(sub)}</span>
              </div>
            ))}
          </div>
          <p className={s.stageLine}>{t("signStageLine")}</p>
        </section>

        <section className={s.card} ref={card} aria-labelledby={isLogin ? "login-title" : "act-title"}>
          <div className={s.tabs} role="tablist">
            {(["login", "activate"] as const).map((m) => (
              <button key={m} type="button" role="tab" className={s.tab} aria-selected={mode === m} onClick={() => switchTo(m)}>
                {t(m === "login" ? "signTabLogin" : "signTabActivate")}
              </button>
            ))}
          </div>

          <div className={s.panes}>
            {/* Sign in */}
            <form className={s.pane} {...pane(isLogin)} noValidate onSubmit={submitLogin}>
              <h1 id="login-title" className={s.title}>
                {t("loginTitle")}
              </h1>
              {subtitle("loginSub", isLogin)}
              {digits(loginCode, "code", "username")}
              {passwordBox(loginPw, "password", "loginPassword", password, setPassword, {
                autoComplete: "current-password",
                bad: error === "loginErrWrong" || error === "loginErrNoPassword",
                toggle: true,
              })}
              {cta("loginCta", "loginChecking")}
            </form>

            {/* First time, step 1: who are you */}
            <form className={s.pane} {...pane(!isLogin && !choosing)} noValidate onSubmit={submitCheck}>
              <h1 id={!choosing ? "act-title" : undefined} className={s.title}>
                {t("actTitle")}
              </h1>
              {subtitle("actSub", !isLogin && !choosing)}
              {digits(actCode, "act-code", "username")}
              <div className={s.field}>
                <div className={s.labelRow}>
                  <label className={s.label} htmlFor="nid">
                    {t("actNationalId")}
                  </label>
                  <span className={s.count} dir="ltr">
                    {nid.length}/{NATIONAL_ID_LENGTH}
                  </span>
                </div>
                <input
                  ref={actNid}
                  id="nid"
                  className={`${s.input} ${s.nid}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  dir="ltr"
                  placeholder={"X".repeat(NATIONAL_ID_LENGTH)}
                  maxLength={NATIONAL_ID_LENGTH}
                  value={nid}
                  onChange={(e) => {
                    setNid(e.target.value.replace(/\D/g, "").slice(0, NATIONAL_ID_LENGTH))
                    setError(null)
                  }}
                  onFocus={() => setFocus("nid")}
                  onBlur={() => setFocus(null)}
                  aria-invalid={error?.startsWith("actErrN") || (!!born && "bad" in born) || undefined}
                />
                <div className={s.nidHint} data-ok={on(!!born && "date" in born)} data-bad={on(!!born && "bad" in born)}>
                  {born && ("bad" in born ? `✕ ${t("actErrNidBad")}` : `✓ ${t("actNidBirth")} ${born.date}`)}
                </div>
              </div>
              {cta("actCheckCta", "loginChecking")}
            </form>

            {/* First time, step 2: choose the password */}
            <form className={s.pane} {...pane(choosing)} noValidate onSubmit={submitSave}>
              <h1 id={choosing ? "act-title" : undefined} className={s.title}>
                {t("loginWelcome")} {step.kind === "password" ? tr(step.name).split(" ")[0] : ""}
              </h1>
              {subtitle("actPassSub", choosing)}
              {/* The id, hidden, so the browser's password manager saves the new password under it. */}
              <input type="text" name="username" autoComplete="username" value={code} readOnly hidden />
              {passwordBox(newPw, "new-password", "actNewPassword", password, setPassword, {
                autoComplete: "new-password",
                bad: error === "actErrRules" || error === "actErrShortPass",
                toggle: true,
              })}
              <div className={s.strength}>
                <div className={s.bars} aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <i key={i} style={i < ruleCount ? { background: ["var(--destructive)", "var(--warning)", "var(--verified)"][ruleCount - 1] } : undefined} />
                  ))}
                </div>
                <div className={s.rules}>
                  {(["actRuleLength", "actRuleLetter", "actRuleDigit"] as const).map((k, i) => (
                    <span key={k} className={s.rule} data-ok={on(rules[i])}>
                      <i aria-hidden>{rules[i] ? "✓" : ""}</i>
                      {t(k)}
                    </span>
                  ))}
                </div>
              </div>
              {passwordBox(againPw, "again", "actConfirmPassword", again, setAgain, {
                autoComplete: "new-password",
                bad: error === "actErrMismatch",
                mark: true,
              })}
              {cta("actSaveCta", "actSaving")}
            </form>
          </div>
        </section>
      </main>

      <footer className={s.foot}>{t("loginFooter")}</footer>
    </div>
  )
}
