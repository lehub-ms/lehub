export interface PaletteEntry {
  readonly name: string
  readonly avatar: string
}

/**
 * 10 hues, each verified ≥4.5:1 white-on-color (see `communityPalette.test.ts`, looped
 * over every entry so a future edit can't silently regress one below AA).
 */
export const PALETTE: readonly PaletteEntry[] = [
  { name: 'blue', avatar: '#1D4ED8' },
  { name: 'rose', avatar: '#BE123C' },
  { name: 'green', avatar: '#15803D' },
  { name: 'slate', avatar: '#1F2937' },
  { name: 'primary', avatar: '#005FB8' },
  { name: 'indigo', avatar: '#4338CA' },
  { name: 'teal', avatar: '#0F766E' },
  { name: 'purple', avatar: '#7E22CE' },
  { name: 'cyan', avatar: '#0E7490' },
  { name: 'brown', avatar: '#78350F' },
]

/** Deterministic, not cryptographic — only used to pick a stable palette slot. */
export function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

export function paletteIndex(id: string, length: number): number {
  return hashString(id) % length
}

export type Rgb = readonly [number, number, number]

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '')
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ]
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}

function srgbChannelToLinear(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
}

function relativeLuminance([r, g, b]: Rgb): number {
  return (
    0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b)
  )
}

/** WCAG 2.1 relative-luminance contrast ratio between two hex colors. */
export function contrastRatio(fg: string, bg: string): number {
  const foreground = relativeLuminance(hexToRgb(fg))
  const background = relativeLuminance(hexToRgb(bg))
  const [lighter, darker] = foreground > background ? [foreground, background] : [background, foreground]
  return (lighter + 0.05) / (darker + 0.05)
}

/** Mixes `hex` toward black by `fraction` (0 = unchanged, 1 = black). */
function darken(hex: string, fraction: number): string {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHex([r * (1 - fraction), g * (1 - fraction), b * (1 - fraction)])
}

/** Mixes `hex` toward white; `colorFraction` is how much of `hex` survives (0 = white, 1 = unchanged). */
export function mixWithWhite(hex: string, colorFraction: number): string {
  const [r, g, b] = hexToRgb(hex)
  const mix = (channel: number) => 255 * (1 - colorFraction) + channel * colorFraction
  return rgbToHex([mix(r), mix(g), mix(b)])
}

function paletteEntry(id: string): PaletteEntry {
  const entry = PALETTE[paletteIndex(id, PALETTE.length)]
  // Unreachable: paletteIndex is always in [0, PALETTE.length). Throwing rather than a
  // non-null assertion keeps `noUncheckedIndexedAccess` satisfied without hiding a real
  // out-of-range bug behind `!`.
  if (!entry) throw new Error(`No palette entry for id "${id}"`)
  return entry
}

/** Same `id` always yields the same color — no color data comes from the API. */
export function communityColor(id: string): string {
  return paletteEntry(id).avatar
}

/** Decorative `EventCard` banner fallback when `bannerImageUrl` is `null`. */
export function communityGradient(id: string): string {
  const hue = communityColor(id)
  return `linear-gradient(135deg, ${darken(hue, 0.35)} 0%, ${hue} 55%, ${darken(hue, 0.55)} 100%)`
}
