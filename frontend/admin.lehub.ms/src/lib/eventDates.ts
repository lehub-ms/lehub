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
 * Les composantes d'un instant lues à Paris, dans l'ordre où un `datetime-local` les attend.
 *
 * `en-CA` parce que son format court est déjà `AAAA-MM-JJ` ; `hourCycle: 'h23'` parce que
 * `hour12: false` rend « 24 » à minuit sur certains moteurs, ce qui ne se recompose pas.
 */
const INPUT_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function partsAt(instant: number): Record<string, string> {
  const parts: Record<string, string> = {}
  for (const part of INPUT_PARTS.formatToParts(new Date(instant))) {
    parts[part.type] = part.value
  }
  return parts
}

/**
 * L'écart entre l'heure de Paris et UTC à un instant donné, en millisecondes.
 *
 * Lu du formateur plutôt que codé en dur : il vaut +1 h l'hiver, +2 h l'été, et les dates de
 * bascule ne sont pas de notre ressort. C'est `Intl` qui porte la base de fuseaux, et c'est la
 * seule source qui restera juste quand les règles changeront.
 */
function parisOffset(instant: number): number {
  const parts = partsAt(instant)
  const asIfUtc = Date.UTC(
    Number(parts['year']),
    Number(parts['month']) - 1,
    Number(parts['day']),
    Number(parts['hour']),
    Number(parts['minute']),
  )
  return asIfUtc - instant
}

/** Le format qu'un `<input type="datetime-local">` lit et rend : `AAAA-MM-JJTHH:MM`. */
const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/**
 * Un instant ISO vers la valeur d'un `<input type="datetime-local">`, en heure de Paris.
 *
 * Le champ n'a pas de fuseau : il porte une heure murale, et laquelle dépend entièrement de ce
 * qu'on y écrit. Sans cette conversion, un organisateur à Montréal verrait 12:30 là où ses
 * participants lisent 18:30, et enregistrerait ce décalage sans que rien ne le signale.
 */
export function toLocalInput(iso: string): string {
  const instant = Date.parse(iso)
  if (Number.isNaN(instant)) return ''

  const parts = partsAt(instant)
  return `${parts['year']}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}`
}

/**
 * La valeur d'un `<input type="datetime-local">`, lue comme une heure de Paris, vers l'instant
 * ISO que l'API accepte.
 *
 * En deux passes, et ce n'est pas une précaution superflue : l'écart à appliquer dépend de
 * l'instant, et l'instant est ce qu'on cherche. La première passe suppose l'écart qui vaut à
 * l'heure murale lue comme si elle était UTC, la seconde le corrige avec celui qui vaut au
 * candidat obtenu. Les deux ne diffèrent qu'aux abords des bascules d'heure, qui sont
 * précisément les seuls moments où une passe unique se tromperait d'une heure.
 *
 * Une heure qui n'existe pas — celle que la bascule de printemps saute — n'a pas d'instant à
 * désigner ; la convergence en rend un voisin plutôt que d'échouer, ce qui vaut mieux qu'un
 * formulaire qui refuserait une saisie sans pouvoir en expliquer la raison.
 */
export function fromLocalInput(local: string): string | null {
  const matched = LOCAL_INPUT.exec(local)
  if (!matched) return null

  const [, year, month, day, hour, minute] = matched
  const wallClock = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  )
  if (Number.isNaN(wallClock)) return null

  const candidate = wallClock - parisOffset(wallClock)
  return new Date(wallClock - parisOffset(candidate)).toISOString()
}

/**
 * Un évènement est-il passé ? (#174)
 *
 * **Sa date de fin est révolue**, et rien d'autre : elle est toujours renseignée depuis
 * l'amendement de #145. Un évènement commencé mais non terminé n'est donc pas passé — c'est même
 * celui sur lequel un organisateur est le plus susceptible d'agir.
 *
 * La comparaison porte sur deux **instants**, pas sur deux heures murales, et c'est ce qui rend
 * la frontière indépendante du fuseau de la machine : `Date.parse` d'un ISO avec offset et
 * `Date.now()` désignent tous deux un point du temps. C'est une garantie plus forte que ce que
 * #174 demande en parlant d'`Europe/Paris` — le fuseau ne décide que de l'*affichage* des dates,
 * jamais de leur ordre.
 *
 * `now` est un paramètre plutôt qu'un appel interne : l'écran le fige au montage, pour qu'un
 * évènement qui se termine pendant que la page est ouverte ne change pas de groupe tout seul —
 * l'edge case que #174 énonce — et pour que les tests n'aient pas à manipuler l'horloge.
 *
 * Une date illisible n'est pas passée : mieux vaut la laisser sous les yeux, où elle se corrige,
 * que la replier dans un groupe qu'on n'ouvre pas.
 */
export function isPastEvent(endDate: string, now: number): boolean {
  const end = Date.parse(endDate)
  return !Number.isNaN(end) && end < now
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
