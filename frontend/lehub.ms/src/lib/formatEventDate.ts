const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const TIME_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
})

/** `Intl`'s short fr-FR weekday ("mer.") comes back lower-case. */
export function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * "mer. 15 janvier 2026 · 18:00 → 20:00" when both instants fall on the same local
 * calendar day, "mer. 15 janvier 2026 → jeu. 16 janvier 2026" otherwise.
 */
export function formatEventDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (start.toDateString() === end.toDateString()) {
    return `${cap(DATE_FORMAT.format(start))} · ${TIME_FORMAT.format(start)} → ${TIME_FORMAT.format(end)}`
  }

  return `${cap(DATE_FORMAT.format(start))} → ${cap(DATE_FORMAT.format(end))}`
}
