/**
 * Le tri et la recherche des tables du backoffice — purs, donc testables sans monter d'écran.
 */

export type SortDirection = 'ascending' | 'descending'

/**
 * Ce qu'une colonne peut valoir pour être triée. Volontairement pas `unknown` : une colonne dont
 * la valeur n'est ni un libellé ni un compteur n'a pas d'ordre évident, et la laisser passer
 * finirait en « [object Object] » rangé quelque part au hasard.
 */
export type Comparable = string | number | null

export interface SortState<K extends string> {
  key: K
  direction: SortDirection
}

/**
 * Rabat une chaîne sur sa forme comparable : sans accent, en minuscules.
 *
 * `NFD` sépare la lettre de son diacritique, que la classe `\p{Diacritic}` retire ensuite. C'est
 * ce qui fait que « communaute » trouve « Communauté » — la maquette s'en tient à un `indexOf`
 * brut, et chercher un nom accentué sans savoir taper l'accent n'y donnait rien.
 */
export function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr')
}

/**
 * Compare deux valeurs d'une même colonne.
 *
 * `localeCompare` en français avec `sensitivity: 'base'` pour que « Élan » se range avec les E et
 * non après les Z ; les nombres se soustraient, parce qu'un tri de compteur d'organisateurs par
 * ordre alphabétique classerait 10 avant 2.
 */
function compare(a: Comparable, b: Comparable): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a ?? '').localeCompare(String(b ?? ''), 'fr', { sensitivity: 'base' })
}

/** Trie une copie : la liste rendue par l'API n'est jamais remaniée sur place. */
export function sortEntries<T, K extends string>(
  entries: readonly T[],
  sort: SortState<K>,
  valueOf: (entry: T, key: K) => Comparable,
): T[] {
  const direction = sort.direction === 'ascending' ? 1 : -1
  return [...entries].sort((a, b) => compare(valueOf(a, sort.key), valueOf(b, sort.key)) * direction)
}

/** Inverse le sens au second clic sur la même colonne, et repart en croissant sur une autre. */
export function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  if (current.key !== key) return { key, direction: 'ascending' }
  return { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' }
}

/**
 * Filtre sur les champs cherchables de chaque entrée.
 *
 * Une requête vide ne filtre rien — et surtout pas « rien ne correspond ».
 */
export function searchEntries<T>(
  entries: readonly T[],
  query: string,
  searchableOf: (entry: T) => readonly (string | null)[],
): T[] {
  const needle = fold(query.trim())
  if (!needle) return [...entries]

  return entries.filter((entry) =>
    searchableOf(entry).some((field) => (field ? fold(field).includes(needle) : false)),
  )
}
