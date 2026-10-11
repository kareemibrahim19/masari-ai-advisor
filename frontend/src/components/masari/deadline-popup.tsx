"use client"

/**
 * From 3 days before a calendar date, a popup at the top of the screen when the student opens the site.
 * It closes only with its own button (not Esc, not a click outside), so we know the student saw it.
 * Once closed it stays closed for that event until the number of days left changes (tomorrow).
 */
import * as React from "react"
import { AlertDialog } from "@base-ui/react/alert-dialog"
import { BellRing } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { dismiss, isDismissed, POPUP_DAYS, upcomingReminders, useToday, type Reminder } from "@/lib/reminders"
import { cn } from "@/lib/utils"

export function DeadlinePopup() {
  const { t, tr } = useI18n()
  const today = useToday()
  const [closed, setClosed] = React.useState(false)
  // Read after mount: dismissals live in this browser's storage.
  const [shown, setShown] = React.useState<Reminder[] | null>(null)

  React.useEffect(() => {
    if (!today) return
    const due = upcomingReminders(today, POPUP_DAYS).filter((r) => !isDismissed(r))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is only readable after mount
    setShown(due)
  }, [today])

  const open = !closed && !!shown && shown.length > 0
  const urgent = !!shown?.some((r) => r.urgency === 3)

  return (
    // onOpenChange is ignored on purpose: only the button below closes it.
    <AlertDialog.Root open={open} onOpenChange={() => {}}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <AlertDialog.Popup
          className={cn(
            "fixed inset-x-4 top-4 z-50 mx-auto max-w-lg space-y-4 rounded-2xl border-2 bg-popover p-5 text-popover-foreground shadow-xl outline-none transition duration-200 data-ending-style:-translate-y-4 data-ending-style:opacity-0 data-starting-style:-translate-y-4 data-starting-style:opacity-0 sm:top-6",
            urgent ? "border-destructive" : "border-warning"
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-xl",
                urgent ? "bg-destructive text-white" : "bg-warning-soft text-warning"
              )}
            >
              <BellRing className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 space-y-1">
              <AlertDialog.Title className="text-base font-semibold">{t("deadlineSoon")}</AlertDialog.Title>
              <AlertDialog.Description className="text-sm text-muted-foreground">{t("deadlineSoonHint")}</AlertDialog.Description>
            </div>
          </div>
          <ul className="space-y-2">
            {shown?.map((r) => (
              <li
                key={r.event.id}
                className={cn(
                  "rounded-xl border p-3 text-sm leading-relaxed",
                  r.urgency === 3 ? "border-destructive/50 bg-destructive/10" : "border-warning/40 bg-warning-soft/60"
                )}
              >
                <p className={cn("font-semibold", r.urgency === 3 ? "text-destructive" : "text-warning")}>
                  {tr(r.event.title)} · {tr(r.when)}
                </p>
                <p className="mt-0.5 text-foreground/85">{tr(r.body)}</p>
              </li>
            ))}
          </ul>
          <Button
            className="h-11 w-full"
            onClick={() => {
              if (shown) dismiss(shown)
              setClosed(true)
            }}
          >
            {t("deadlineGotIt")}
          </Button>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
