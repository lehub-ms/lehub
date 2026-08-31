import { useMemo, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { SearchX } from 'lucide-react'
import { EmptyState } from '@lehub/shared/components/EmptyState'
import { ErrorState } from '@lehub/shared/components/ErrorState'
import { DataTable, type Column } from '@/components/data/DataTable'
import { ResultCount } from '@/components/data/ResultCount'
import { SearchField } from '@/components/data/SearchField'
import type { ReferenceListState } from '@/hooks/useReferenceList'
import {
  nextSort,
  searchEntries,
  sortEntries,
  type Comparable,
  type SortState,
} from '@/lib/referenceFilters'

interface ReferenceScreenProps<T, K extends string> {
  title: string
  intro: string
  icon: LucideIcon
  state: ReferenceListState<T> & { refetch: () => void }
  columns: readonly Column<T, K>[]
  getRowId: (entry: T) => string
  defaultSortKey: K
  valueOf: (entry: T, key: K) => Comparable
  /** Les champs sur lesquels la recherche porte — le nom seul, ou le nom et la description. */
  searchableOf: (entry: T) => readonly (string | null)[]
  searchPlaceholder: string
  singular: string
  plural: string
  emptyTitle: string
  emptyDescription: string
  errorTitle: string
}

/**
 * L'écran que les deux référentiels partagent : en-tête, barre d'outils, table.
 *
 * Ils se ressemblent assez pour n'avoir qu'un écran — c'est la Feature qui le dit — et diffèrent
 * par leurs colonnes et par ce sur quoi la recherche porte. Tout cela passe en props plutôt qu'en
 * branches `if (kind === 'community')`, pour que l'ajout d'un troisième référentiel un jour ne
 * consiste pas à rouvrir ce fichier.
 *
 * Le tri et la recherche sont **côté client**, sur la liste entière : ces référentiels comptent
 * des dizaines d'entrées, pas des milliers, et un aller-retour réseau par frappe serait plus lent
 * qu'utile. Le jour où l'un d'eux grandit, c'est ici que la pagination arrivera.
 */
export function ReferenceScreen<T, K extends string>({
  title,
  intro,
  icon,
  state,
  columns,
  getRowId,
  defaultSortKey,
  valueOf,
  searchableOf,
  searchPlaceholder,
  singular,
  plural,
  emptyTitle,
  emptyDescription,
  errorTitle,
}: ReferenceScreenProps<T, K>): ReactNode {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState<K>>({
    key: defaultSortKey,
    direction: 'ascending',
  })

  const entries = state.status === 'success' ? state.entries : null

  // Recherche puis tri, jamais l'inverse : trier ce qu'on va jeter est du travail perdu, et le
  // résultat est le même.
  const visible = useMemo(() => {
    if (!entries) return []
    return sortEntries(searchEntries(entries, query, searchableOf), sort, valueOf)
  }, [entries, query, sort, searchableOf, valueOf])

  return (
    <>
      <header>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-[0.9375rem] text-ink-muted">{intro}</p>
      </header>

      {state.status === 'loading' ? (
        <p role="status" className="mt-8 text-[0.9375rem] text-ink-muted">
          Chargement…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <div className="mt-8">
          <ErrorState title={errorTitle} error={state.error} onRetry={state.refetch} />
        </div>
      ) : null}

      {entries ? (
        entries.length === 0 ? (
          // Référentiel vide : distinct d'une recherche sans résultat, parce que ce n'est pas le
          // même problème et que la sortie n'est pas la même.
          <div className="mt-8">
            <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} />
          </div>
        ) : (
          <section className="glass mt-8 rounded-2xl p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <SearchField
                label={searchPlaceholder}
                placeholder={searchPlaceholder}
                value={query}
                onChange={setQuery}
              />
              <ResultCount count={visible.length} singular={singular} plural={plural} />
            </div>

            {visible.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title={`Aucun résultat pour « ${query} »`}
                description="Vérifiez l’orthographe, ou effacez la recherche pour retrouver la liste complète."
                action={{
                  // Pas « Effacer la recherche » : le champ juste au-dessus porte déjà ce nom,
                  // et deux boutons de même intitulé s'annoncent à l'identique dans une liste de
                  // commandes. Celui-ci dit son résultat plutôt que son geste.
                  label: `Afficher toutes les ${plural}`,
                  onClick: () => {
                    setQuery('')
                  },
                }}
              />
            ) : (
              <DataTable
                caption={title}
                columns={columns}
                entries={visible}
                getRowId={getRowId}
                sort={sort}
                onSortChange={(key) => {
                  setSort((current) => nextSort(current, key))
                }}
              />
            )}
          </section>
        )
      ) : null}
    </>
  )
}
