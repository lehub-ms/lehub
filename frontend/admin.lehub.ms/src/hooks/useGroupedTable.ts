import { useMemo, useState } from 'react'
import {
  nextSort,
  partition,
  searchEntries,
  sortEntries,
  type Comparable,
  type SortState,
} from '@/lib/referenceFilters'
import { readGroupExpanded, writeGroupExpanded, type GroupScope } from '@/lib/preferences'

interface GroupedTableInput<T, K extends string> {
  /** La liste lue, ou `null` tant qu'elle ne l'est pas. */
  entries: readonly T[] | null
  defaultSortKey: K
  valueOf: (entry: T, key: K) => Comparable
  searchableOf: (entry: T) => readonly (string | null)[]
  /** Ce qui range une entrée derrière le repli : archivée (#173), passée (#174). */
  isGrouped: (entry: T) => boolean
  /** Sous quelle clé la préférence de repli est retenue, par écran. */
  preferenceScope: GroupScope
}

interface GroupedTable<T, K extends string> {
  query: string
  setQuery: (query: string) => void
  searching: boolean
  sort: SortState<K>
  onSortChange: (key: K) => void
  /** Les entrées visibles d'emblée. */
  visible: T[]
  /** Celles derrière la ligne de groupe. */
  grouped: T[]
  expanded: boolean
  toggleGroup: () => void
}

/**
 * Recherche, tri, partition et repli d'une table du backoffice.
 *
 * Extrait de `ReferenceScreen`, où #173 l'avait écrit d'abord, parce que #174 en demandait
 * exactement autant pour les évènements passés. « Celle des deux qui est livrée en second reprend
 * le composant de la première plutôt que de le refaire » : la ligne de groupe elle-même vivait
 * déjà dans `DataTable`, c'est l'orchestration qui manquait.
 *
 * Les deux écrans qui s'en servent vivent tous deux dans le backoffice, et le hook aussi. #174
 * suggérait `@lehub/shared` ; ce serait le mauvais endroit, pour la raison que `DataTable`
 * donne déjà : le site public est fait de cartes, pas de tableaux, et rien là-bas ne le
 * consommerait.
 *
 * **L'ordre des opérations est le contrat.** Recherche, puis tri, puis partition *en dernier* :
 * trier ce qu'on s'apprête à jeter est du travail perdu, et partitionner avant de trier donnerait
 * deux tris, un par groupe. #173 et #174 refusent tous deux ce second tri invisible — « le tri des
 * en-têtes est global et réordonne les deux groupes avant que le repli ne les sépare ».
 */
export function useGroupedTable<T, K extends string>({
  entries,
  defaultSortKey,
  valueOf,
  searchableOf,
  isGrouped,
  preferenceScope,
}: GroupedTableInput<T, K>): GroupedTable<T, K> {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState<K>>({ key: defaultSortKey, direction: 'ascending' })

  /* Lue au premier rendu, comme la barre latérale : un écran qui s'afficherait déplié puis se
     replierait sous les yeux serait pire que pas de préférence du tout. Un initialiseur, jamais
     un effet — `react-hooks/set-state-in-effect` l'interdit, et il a raison. */
  const [preferred, setPreferred] = useState(() => readGroupExpanded(preferenceScope))

  /* Le repli **pendant** une recherche est un état à part, réarmé à chaque frappe. C'est ce qui
     fait qu'effacer la recherche revient à la préférence sans avoir à la restaurer : il n'y a
     rien à restaurer, la préférence n'a jamais bougé. L'ajustement se fait au rendu, le patron
     que React documente pour dériver un état d'une valeur qui change. */
  const [expandedWhileSearching, setExpandedWhileSearching] = useState(true)
  const [seenQuery, setSeenQuery] = useState(query)
  if (seenQuery !== query) {
    setSeenQuery(query)
    setExpandedWhileSearching(true)
  }

  const searching = query.trim().length > 0
  const expanded = searching ? expandedWhileSearching : preferred

  const { visible, grouped } = useMemo(() => {
    if (!entries) return { visible: [], grouped: [] }
    const ordered = sortEntries(searchEntries(entries, query, searchableOf), sort, valueOf)
    const split = partition(ordered, isGrouped)
    return { visible: split.rest, grouped: split.matched }
  }, [entries, query, sort, searchableOf, valueOf, isGrouped])

  function toggleGroup(): void {
    /* Pendant une recherche, le repli est réel mais éphémère : il n'est pas retenu, et la frappe
       suivante rouvre le groupe. Le contrôle reste donc vivant et son `aria-expanded` reste vrai
       dans tous les cas — un bouton désactivé sortirait du parcours clavier, et un bouton sans
       effet visible annoncerait un état qu'il n'a pas. */
    if (searching) {
      setExpandedWhileSearching(!expanded)
      return
    }
    setPreferred(!expanded)
    writeGroupExpanded(preferenceScope, !expanded)
  }

  return {
    query,
    setQuery,
    searching,
    sort,
    onSortChange: (key) => {
      setSort((current) => nextSort(current, key))
    },
    visible,
    grouped,
    expanded,
    toggleGroup,
  }
}
