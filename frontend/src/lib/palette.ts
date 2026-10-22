"use client"

import * as React from "react"
import { createStoredValue } from "@/lib/use-stored"

export const PALETTES = ["default", "navy", "green"] as const
export type Palette = (typeof PALETTES)[number]

/** Three main colours per colour theme, for the picker preview. */
export const PALETTE_SWATCHES: Record<Palette, [string, string, string]> = {
  default: ["#1e2230", "#f27a2e", "#f8f8f7"],
  navy: ["#0c4a6e", "#06b6d4", "#f97316"],
  green: ["#52796f", "#354f52", "#dda15e"],
}

const KEY = "masari.palette"
const useStoredPalette = createStoredValue<Palette>(KEY, "default", (v): v is Palette => (PALETTES as readonly string[]).includes(v))

// html[data-palette] drives the CSS in globals.css. The pre-paint script in layout.tsx sets it before first paint.
const apply = (p: Palette) => {
  if (p === "default") delete document.documentElement.dataset.palette
  else document.documentElement.dataset.palette = p
}

/** Colour theme (default | navy | green), saved as masari.palette. Independent of the light/dark mode (masari.theme). */
export function usePalette() {
  const [palette, setStored] = useStoredPalette()
  React.useEffect(() => apply(palette), [palette])
  return {
    palette,
    setPalette: (p: Palette) => {
      apply(p)
      setStored(p)
    },
  }
}
