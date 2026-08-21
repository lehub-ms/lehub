import { describe, expect, it } from 'vitest'
import { cap, formatEventDateRange } from '@/lib/formatEventDate'

describe('cap', () => {
  it('capitalizes the first character only', () => {
    expect(cap('mer. 15 janvier 2026')).toBe('Mer. 15 janvier 2026')
  })
})

// `Z`-suffixed UTC instants, matching what `GET /api/events` actually returns
// (`api/src/lib/eventsRepo.ts` calls `.toISOString()` on the SQL `DATETIME2` columns) —
// exercising the same parsing path production does, not a timezone-less local string.
// January is CET (UTC+1) in Europe/Paris, no DST to account for.
describe('formatEventDateRange', () => {
  it('renders a single date with a time range when both instants share a calendar day in Europe/Paris', () => {
    const label = formatEventDateRange('2026-01-14T17:00:00.000Z', '2026-01-14T19:00:00.000Z')
    expect(label).toMatch(/^Mer\. 14 janvier 2026 · 18:00 → 20:00$/)
  })

  it('renders two dates when the event spans several calendar days', () => {
    const label = formatEventDateRange('2026-01-21T08:00:00.000Z', '2026-01-22T08:00:00.000Z')
    expect(label).toMatch(/^Mer\. 21 janvier 2026 → Jeu\. 22 janvier 2026$/)
  })

  it('treats an event crossing midnight in Europe/Paris as spanning two days, even when both instants share a UTC calendar day', () => {
    // 23:30 and 00:30 Paris time — both still "2026-01-14" in UTC, which is exactly
    // what a naive `toDateString()` (system-timezone) comparison would get wrong for a
    // UTC-based visitor.
    const label = formatEventDateRange('2026-01-14T22:30:00.000Z', '2026-01-14T23:30:00.000Z')
    expect(label).toMatch(/^Mer\. 14 janvier 2026 → Jeu\. 15 janvier 2026$/)
  })
})
