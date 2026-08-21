import { PALETTE, mixWithWhite, paletteIndex } from './communityPalette'

export interface TechPaletteEntry {
  readonly text: string
  readonly bg: string
}

/**
 * Same 10 hues as `communityPalette`, but as light text-on-background pairs: `bg` is the
 * hue mixed 8% into white, `text` is the solid hue. Every entry is verified ≥4.5:1
 * text-on-bg in `technologyPalette.test.ts`, looped over the whole table — several rows
 * (green, cyan) land as tight as ~4.5–4.9:1, so a future palette edit must re-run that
 * test rather than eyeball a swatch.
 */
export const TECH_PALETTE: readonly TechPaletteEntry[] = PALETTE.map((entry) => ({
  text: entry.avatar,
  bg: mixWithWhite(entry.avatar, 0.08),
}))

function techPaletteEntry(id: string): TechPaletteEntry {
  const entry = TECH_PALETTE[paletteIndex(id, TECH_PALETTE.length)]
  // Unreachable: paletteIndex is always in [0, TECH_PALETTE.length).
  if (!entry) throw new Error(`No technology palette entry for id "${id}"`)
  return entry
}

/** Same `id` always yields the same pair — no color data comes from the API. */
export function technologyPillColors(id: string): TechPaletteEntry {
  return techPaletteEntry(id)
}
