"use client"

/** A password input with an eye button that shows or hides what was typed (login and activate pages). */
import * as React from "react"
import { Eye, EyeOff } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import s from "./login.module.css"

type Props = Omit<React.ComponentProps<"input">, "type"> & {
  /** Changing it re-creates the input, which replays the shake animation (the eye keeps its state). */
  shakeKey?: React.Key
}

export function PasswordField({ className, shakeKey, ...props }: Props) {
  const { t } = useI18n()
  const [shown, setShown] = React.useState(false)
  return (
    <div className={s.pwWrap}>
      <input key={shakeKey} {...props} type={shown ? "text" : "password"} dir="ltr" className={`${s.input} ${s.pwInput} ${className ?? ""}`} />
      <button
        type="button"
        className={s.pwToggle}
        onClick={() => setShown((v) => !v)}
        aria-label={t(shown ? "hidePassword" : "showPassword")}
        title={t(shown ? "hidePassword" : "showPassword")}
        aria-pressed={shown}
      >
        {shown ? <EyeOff className={s.icon} aria-hidden /> : <Eye className={s.icon} aria-hidden />}
      </button>
    </div>
  )
}
