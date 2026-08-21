import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/communityPalette'
import { TECH_PALETTE, technologyPillColors } from '@/lib/technologyPalette'

describe('technologyPillColors', () => {
  it('is deterministic for a given id', () => {
    expect(technologyPillColors('technology-7')).toEqual(technologyPillColors('technology-7'))
  })
})

describe('TECH_PALETTE', () => {
  it.each(TECH_PALETTE.map((entry, index) => [index, entry.text, entry.bg] as const))(
    'meets the 4.5:1 AA floor for entry %s (text on bg)',
    (_index, text, bg) => {
      expect(contrastRatio(text, bg)).toBeGreaterThanOrEqual(4.5)
    },
  )
})
