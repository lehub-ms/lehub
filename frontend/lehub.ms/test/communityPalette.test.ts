import { describe, expect, it } from 'vitest'
import { PALETTE, communityColor, communityGradient, contrastRatio } from '@/lib/communityPalette'

describe('communityColor', () => {
  it('is deterministic for a given id', () => {
    expect(communityColor('community-42')).toBe(communityColor('community-42'))
  })

  it('can differ between distinct ids', () => {
    const colors = new Set(Array.from({ length: 20 }, (_, index) => communityColor(`community-${index}`)))
    expect(colors.size).toBeGreaterThan(1)
  })
})

describe('communityGradient', () => {
  it('is a deterministic 3-stop gradient', () => {
    const gradient = communityGradient('community-1')
    // The middle stop is a `PALETTE` avatar hex verbatim (e.g. "#7E22CE"), the two
    // darkened stops are computed lowercase — hence case-insensitive.
    expect(gradient).toMatch(/^linear-gradient\(135deg, #[0-9a-f]{6} 0%, #[0-9a-f]{6} 55%, #[0-9a-f]{6} 100%\)$/i)
    expect(communityGradient('community-1')).toBe(gradient)
  })
})

describe('PALETTE', () => {
  it.each(PALETTE.map((entry) => [entry.name, entry.avatar] as const))(
    'meets the 4.5:1 AA floor for white text on the "%s" avatar background',
    (_name, avatar) => {
      expect(contrastRatio('#ffffff', avatar)).toBeGreaterThanOrEqual(4.5)
    },
  )
})
