/** Events are French-market and stored/displayed in the organizers' own timezone,
    regardless of a visitor's OS timezone — a Québécois or Réunionnais visitor must see
    the same "same day" / hour as everyone else, not one shifted by their own locale. */
const EVENT_TIME_ZONE = 'Europe/Paris'

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: EVENT_TIME_ZONE,
})

const TIME_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: EVENT_TIME_ZONE,
})

/** `en-CA` gives a plain `YYYY-MM-DD` — just enough to compare calendar days. */
const DAY_KEY_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: EVENT_TIME_ZONE })

/** `Intl`'s short fr-FR weekday ("mer.") comes back lower-case. */
export function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * "mer. 15 janvier 2026 · 18:00 → 20:00" when both instants fall on the same calendar
 * day in `Europe/Paris`, "mer. 15 janvier 2026 → jeu. 16 janvier 2026" otherwise.
 */
export function formatEventDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (DAY_KEY_FORMAT.format(start) === DAY_KEY_FORMAT.format(end)) {
    return `${cap(DATE_FORMAT.format(start))} · ${TIME_FORMAT.format(start)} → ${TIME_FORMAT.format(end)}`
  }

  return `${cap(DATE_FORMAT.format(start))} → ${cap(DATE_FORMAT.format(end))}`
}
