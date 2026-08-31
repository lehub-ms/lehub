/**
 * Les dates d'un évènement, telles que le backoffice les montre.
 *
 * **Tout est calculé dans `Europe/Paris`, explicitement.** Le fuseau n'est jamais celui du
 * navigateur : LeHub est l'agenda des communautés francophones, un évènement annoncé à 18h30 est
 * à 18h30 à Paris, et un organisateur en déplacement à Montréal doit lire la même heure que ses
 * participants. Sans `timeZone`, `Intl` prendrait celui de la machine et l'écran mentirait
 * silencieusement — le pire des deux mondes, puisque rien ne le signalerait.
 *
 * Les formateurs sont construits une fois au module : `Intl.DateTimeFormat` est coûteux à
 * instancier et une liste en rend un par ligne et par colonne.
 */
const TIME_ZONE = 'Europe/Paris'

const DAY_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  weekday: 'long',
})

const TIME_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
})

/** Ce qu'une cellule de date affiche : le jour en évidence, le reste en dessous. */
export interface EventDateParts {
  /** « 10 sept. 2026 ». */
  day: string
  /** « jeudi · 18:30 ». */
  detail: string
}

/**
 * Découpe une date ISO en ses deux lignes d'affichage, ou rend `null` si elle est illisible.
 *
 * `null` plutôt qu'une exception : une date que le contrat garantit peut malgré tout arriver
 * vide d'un environnement mal migré, et une liste entière qui ne s'affiche plus pour une ligne
 * fautive est une panne bien pire que la ligne fautive.
 */
export function eventDateParts(iso: string): EventDateParts | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null

  return {
    day: DAY_FORMAT.format(date),
    detail: `${WEEKDAY_FORMAT.format(date)} · ${TIME_FORMAT.format(date)}`,
  }
}

/**
 * L'instant d'une date ISO, en millisecondes, pour trier.
 *
 * Un nombre et non la chaîne : `referenceFilters` compare les chaînes avec `localeCompare`, dont
 * l'ordre sur des dates n'est celui du temps que par accident de format. Une date illisible se
 * range en tête plutôt que de faire échouer le tri.
 */
export function eventTimestamp(iso: string): number {
  const parsed = Date.parse(iso)
  return Number.isNaN(parsed) ? 0 : parsed
}
