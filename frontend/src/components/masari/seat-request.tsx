"use client"

import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import type { useSeatRequests } from "@/lib/seat-requests"
import { cn } from "@/lib/utils"

/** "Request a seat" for one full section; shows "Request sent" once the service has it. */
export function SeatRequestButton({
  seats,
  code,
  section,
  className,
  size,
}: {
  seats: ReturnType<typeof useSeatRequests>
  code: string
  section: string
  className?: string
  size?: "sm" | "default"
}) {
  const { t } = useI18n()
  const sent = seats.isSent(code, section)
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        variant="outline"
        size={size}
        className={cn("gap-1.5", className)}
        disabled={sent || seats.isBusy(code, section)}
        onClick={() => seats.request(code, section)}
      >
        {sent && <Check className="size-4" aria-hidden />}
        {sent ? t("seatRequested") : t("requestSeat")}
      </Button>
      {seats.hasFailed(code, section) && (
        <span className="text-xs text-destructive" role="alert">
          {t("seatRequestFailed")}
        </span>
      )}
    </span>
  )
}
