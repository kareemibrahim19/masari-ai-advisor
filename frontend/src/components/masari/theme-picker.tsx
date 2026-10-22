"use client"

import { Palette as PaletteIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useI18n } from "@/lib/i18n"
import { PALETTES, PALETTE_SWATCHES, type Palette, usePalette } from "@/lib/palette"

const NAMES: Record<Palette, string> = { default: "Black", navy: "Navy", green: "Green" }

/** Header button that opens a small menu of the three colour themes (name, three swatches, a check on the chosen one). */
export function ThemePicker({ trigger }: { trigger?: React.ReactElement }) {
  const { t } = useI18n()
  const { palette, setPalette } = usePalette()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          trigger ?? <Button variant="ghost" size="icon-lg" className="size-10" aria-label={t("colorTheme")} title={t("colorTheme")} />
        }
      >
        <PaletteIcon className="size-[18px]" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 max-w-[calc(100vw-1.5rem)]">
        <DropdownMenuRadioGroup value={palette} onValueChange={(v) => setPalette(v as Palette)}>
          {PALETTES.map((p) => (
            <DropdownMenuRadioItem key={p} value={p} className="min-h-10 gap-2.5">
              <span lang="en" dir="ltr" className="flex -space-x-1" aria-hidden>
                {PALETTE_SWATCHES[p].map((c) => (
                  <span key={c} className="size-4 rounded-full ring-2 ring-popover outline-1 -outline-offset-1 outline-foreground/15" style={{ backgroundColor: c }} />
                ))}
              </span>
              <span lang="en" translate="no" className="flex-1 font-medium">
                {NAMES[p]}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
