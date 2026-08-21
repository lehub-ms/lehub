import { describe, expect, it } from 'vitest'
import { cap, formatEventDateRange } from '@/lib/formatEventDate'

describe('cap', () => {
  it('capitalizes the first character only', () => {
    expect(cap('mer. 15 janvier 2026')).toBe('Mer. 15 janvier 2026')
  })
})

describe('formatEventDateRange', () => {
  it('renders a single date with a time range when both instants share a calendar day', () => {
    const label = formatEventDateRange('2026-01-14T18:00:00', '2026-01-14T20:00:00')
    expect(label).toMatch(/^Mer\. 14 janvier 2026 · 18:00 → 20:00$/)
  })

  it('renders two dates when the event spans several calendar days', () => {
    const label = formatEventDateRange('2026-01-21T09:00:00', '2026-01-22T09:00:00')
    expect(label).toMatch(/^Mer\. 21 janvier 2026 → Jeu\. 22 janvier 2026$/)
  })

  it('treats an event crossing midnight as spanning two days', () => {
    const label = formatEventDateRange('2026-01-14T23:30:00', '2026-01-15T00:30:00')
    expect(label).toMatch(/^Mer\. 14 janvier 2026 → Jeu\. 15 janvier 2026$/)
  })
})
