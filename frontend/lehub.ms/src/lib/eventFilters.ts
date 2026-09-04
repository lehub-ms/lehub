import type { EventSummary, NamedRef } from './api'

/**
 * A filter option is exactly the ref it was derived from — id, name *and* logo. It used
 * to be a `{ id, name }` projection, which silently dropped the `logoUrl` the API
 * already sends and left the filter UI with nothing but initials to render.
 */
export type FilterOption = NamedRef

export interface EventFilterSelection {
  communityIds: string[]
  technologyIds: string[]
}

export const EMPTY_FILTER_SELECTION: EventFilterSelection = {
  communityIds: [],
  technologyIds: [],
}

export interface FilterOptionsData {
  communities: FilterOption[]
  technologies: FilterOption[]
}

function dedupeById(refs: NamedRef[]): FilterOption[] {
  const seen = new Map<string, FilterOption>()
  for (const ref of refs) {
    // Une entrée archivée n'est plus proposée au filtrage (#155). Elle reste bel et bien sur les
    // cartes des évènements qui la référencent : le rattachement est intact, c'est la
    // *proposition* qui disparaît. Sans cela, une communauté qui a cessé son activité resterait
    // offerte comme filtre aussi longtemps qu'un évènement passé la porte.
    if (ref.archived === true) continue
    if (!seen.has(ref.id)) seen.set(ref.id, ref)
  }
  return [...seen.values()]
}

/**
 * Always compute from the FULL upcoming-events set, never from an already-filtered
 * subset — stories #21/#22 require each dimension's option list to stay independent of
 * the other dimension's active filter, so an option must remain listed even when it
 * currently matches zero visible events.
 */
export function deriveFilterOptions(events: EventSummary[]): FilterOptionsData {
  return {
    communities: dedupeById(events.flatMap((event) => event.communities)),
    technologies: dedupeById(events.flatMap((event) => event.technologies)),
  }
}

function matchesDimension(refs: NamedRef[], selectedIds: string[]): boolean {
  // Empty selection excludes nothing from this dimension.
  return selectedIds.length === 0 || refs.some((ref) => selectedIds.includes(ref.id))
}

/** OR within each dimension, AND across the two dimensions. */
export function applyEventFilters(
  events: EventSummary[],
  selection: EventFilterSelection,
): EventSummary[] {
  return events.filter(
    (event) =>
      matchesDimension(event.communities, selection.communityIds) &&
      matchesDimension(event.technologies, selection.technologyIds),
  )
}

export function activeFilterCount(selection: EventFilterSelection): number {
  return selection.communityIds.length + selection.technologyIds.length
}

/**
 * Deux sélections portent-elles le même ensemble d'entrées ?
 *
 * Ensembliste, et c'est tout l'intérêt : cocher A puis B, ou B puis A, donne la même sélection,
 * et la barre de préférences ne doit pas y voir une divergence. Une comparaison de tableaux
 * position par position en verrait une à chaque fois.
 */
function sameIds(a: string[], b: string[]): boolean {
  const left = new Set(a)
  const right = new Set(b)
  return left.size === right.size && [...left].every((id) => right.has(id))
}

export function sameFilterSelection(a: EventFilterSelection, b: EventFilterSelection): boolean {
  return (
    sameIds(a.communityIds, b.communityIds) && sameIds(a.technologyIds, b.technologyIds)
  )
}

/** Une entrée de l'écart, nommée — un compte dirait qu'il y a une différence, pas laquelle. */
export interface FilterDiffEntry {
  id: string
  name: string
  dimension: 'community' | 'technology'
}

export interface FilterDiff {
  added: FilterDiffEntry[]
  removed: FilterDiffEntry[]
}

/**
 * Ce qui a été ajouté et ce qui a été retiré depuis la sélection enregistrée.
 *
 * `names` résout un identifiant en nom. Il reçoit les options du filtrage **complétées par les
 * entrées enregistrées**, parce qu'une entrée retirée peut être archivée : elle n'est plus
 * proposée nulle part, et sans ce complément l'écart l'annoncerait par un identifiant nu.
 */
export function diffFilterSelection(
  saved: EventFilterSelection,
  current: EventFilterSelection,
  names: ReadonlyMap<string, string>,
): FilterDiff {
  const entries = (
    ids: string[],
    against: string[],
    dimension: FilterDiffEntry['dimension'],
  ): FilterDiffEntry[] => {
    const other = new Set(against)
    return [...new Set(ids)]
      .filter((id) => !other.has(id))
      .map((id) => ({ id, name: names.get(id) ?? id, dimension }))
  }

  return {
    added: [
      ...entries(current.communityIds, saved.communityIds, 'community'),
      ...entries(current.technologyIds, saved.technologyIds, 'technology'),
    ],
    removed: [
      ...entries(saved.communityIds, current.communityIds, 'community'),
      ...entries(saved.technologyIds, current.technologyIds, 'technology'),
    ],
  }
}

/** « 3 communautés · 2 technologies », ou ce que vaut une sélection vide. */
export function summarizeSelection(selection: EventFilterSelection): string {
  const parts: string[] = []
  const communities = new Set(selection.communityIds).size
  const technologies = new Set(selection.technologyIds).size

  if (communities > 0) parts.push(`${communities} communauté${communities > 1 ? 's' : ''}`)
  if (technologies > 0) parts.push(`${technologies} technologie${technologies > 1 ? 's' : ''}`)

  // Une sélection vide se *dit*, elle ne se laisse pas deviner d'un résumé absent : enregistrer
  // « tous les évènements » est un choix, et la barre doit l'énoncer comme tel.
  return parts.length === 0 ? 'Tous les évènements — aucun filtre' : parts.join(' · ')
}

/**
 * La sélection enregistrée, telle que l'API la rend : des entrées complètes, pas des
 * identifiants nus.
 *
 * Rien n'est retiré au passage, pas même une entrée archivée. Elle n'apparaîtra pas dans les
 * options — `deriveFilterOptions` l'exclut — mais elle continue de désigner les évènements qui
 * la portent, et la conserver ici est ce qui la préserve à l'enregistrement suivant plutôt que
 * de la perdre silencieusement.
 */
export function selectionFromRefs(
  communities: NamedRef[],
  technologies: NamedRef[],
): EventFilterSelection {
  return {
    communityIds: communities.map((ref) => ref.id),
    technologyIds: technologies.map((ref) => ref.id),
  }
}
