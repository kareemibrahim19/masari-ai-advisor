"use client"

/** Unknown address: Masari looks confused, with the way back to the dashboard. */
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Bot } from "@/components/masari/bot"
import { useI18n } from "@/lib/i18n"

export default function NotFound() {
  const { t } = useI18n()
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <Bot mood="confused" enter className="w-32" />
      <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
      <p className="text-muted-foreground text-pretty">{t("notFoundSub")}</p>
      <Button nativeButton={false} render={<Link href="/" />} size="lg">
        {t("notFoundBack")}
      </Button>
    </div>
  )
}
