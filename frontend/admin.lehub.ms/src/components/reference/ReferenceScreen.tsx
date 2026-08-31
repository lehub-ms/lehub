import { type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Pencil, Plus, SearchX } from 'lucide-react'
import { Button } from '@lehub/shared/components/Button'
import { EmptyState } from '@lehub/shared/components/EmptyState'
import { ErrorState } from '@lehub/shared/components/ErrorState'
import { DataTable, type Column } from '@/components/data/DataTable'
import { ResultCount } from '@/components/data/ResultCount'
import { SearchField } from '@/components/data/SearchField'
import { useGroupedTable } from '@/hooks/useGroupedTable'
import type { ReferenceListState } from '@/hooks/useReferenceList'
import type { Comparable } from '@/lib/referenceFilters'
import { type GroupScope } from '@/lib/preferences'
import { quantify, type Word } from '@/lib/words'

interface ReferenceScreenProps<T, K extends string> {
  title: string
  intro: string
  icon: LucideIcon
  state: ReferenceListState<T> & { refetch: () => void }
  columns: readonly Column<T, K>[]
  getRowId: (entry: T) => string
  /** Le libellé d'une entrée, pour nommer l'action de ligne : « Modifier Azure User Group ». */
  labelOf: (entry: T) => string
  defaultSortKey: K
  valueOf: (entry: T, key: K) => Comparable
  /** Les champs sur lesquels la recherche porte — le nom seul, ou le nom et la description. */
  searchableOf: (entry: T) => readonly (string | null)[]
  searchPlaceholder: string
  /** « communauté » / « communautés ». */
  noun: Word
  /** « active » / « actives » : l'adjectif s'accorde au genre du nom, donc il vient d'ici. */
  activeWord: Word
  /** « archivée » / « archivées ». */
  archivedWord: Word
  /** Ce qui range une entrée dans le groupe replié (#173). */
  isArchived: (entry: T) => boolean
  /** Sous quelle clé la préférence de repli est retenue, par référentiel. */
  preferenceScope: GroupScope
  emptyTitle: string
  emptyDescription: string
  errorTitle: string
  /** L'intitulé du bouton d'ajout — « Nouvelle communauté ». */
  createLabel: string
  /**
   * Ouvrent le panneau. L'écran ne sait pas ce qu'il contient, seulement quand l'ouvrir — et il
   * passe le bouton qui vient de le faire, à qui le panneau rendra le focus en se refermant.
   */
  onCreate: (trigger: HTMLElement) => void
  onEdit: (entry: T, trigger: HTMLElement) => void
  /** Le panneau lui-même, rendu par l'appelant. */
  panel?: ReactNode
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
  labelOf,
  defaultSortKey,
  valueOf,
  searchableOf,
  searchPlaceholder,
  noun,
  activeWord,
  archivedWord,
  isArchived,
  preferenceScope,
  emptyTitle,
  emptyDescription,
  errorTitle,
  createLabel,
  onCreate,
  onEdit,
  panel,
}: ReferenceScreenProps<T, K>): ReactNode {
  const entries = state.status === 'success' ? state.entries : null

  /* Recherche, tri, partition et repli : la même mécanique que la liste des évènements (#174),
     et donc le même hook. Ce qui reste ici est ce qui distingue un référentiel — ses colonnes,
     son tiroir, son vocabulaire. */
  const table = useGroupedTable({
    entries,
    defaultSortKey,
    valueOf,
    searchableOf,
    isGrouped: isArchived,
    preferenceScope,
  })
  const { query, setQuery, searching, expanded } = table
  const active = table.visible
  const archived = table.grouped

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-2 text-[0.9375rem] text-ink-muted">{intro}</p>
        </div>
        <Button
          onClick={(event) => {
            onCreate(event.currentTarget)
          }}
        >
          <Plus aria-hidden="true" className="size-[18px]" />
          {createLabel}
        </Button>
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
            <EmptyState
              icon={icon}
              title={emptyTitle}
              description={emptyDescription}
              action={{
                label: createLabel,
                onClick: (event) => {
                  onCreate(event.currentTarget)
                },
              }}
            />
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
              <ResultCount
                activeCount={active.length}
                archivedCount={archived.length}
                noun={noun}
                activeWord={activeWord}
                archivedWord={archivedWord}
              />
            </div>

            {active.length === 0 && archived.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title={`Aucun résultat pour « ${query} »`}
                description="Vérifiez l’orthographe, ou effacez la recherche pour retrouver la liste complète."
                action={{
                  // Pas « Effacer la recherche » : le champ juste au-dessus porte déjà ce nom,
                  // et deux boutons de même intitulé s'annoncent à l'identique dans une liste de
                  // commandes. Celui-ci dit son résultat plutôt que son geste.
                  label: `Afficher toutes les ${noun.many}`,
                  onClick: () => {
                    setQuery('')
                  },
                }}
              />
            ) : (
              <DataTable
                caption={title}
                columns={columns}
                entries={active}
                getRowId={getRowId}
                sort={table.sort}
                onSortChange={table.onSortChange}
                // « Entrée » et non le nom du référentiel : « Aucune communauté active » contre
                // « Aucun évènement actif » demanderait d'accorder aussi l'article, là où
                // « entrée » est féminin, générique et vrai partout.
                emptyRow={
                  searching
                    ? 'Aucune entrée active ne correspond à cette recherche.'
                    : 'Aucune entrée active.'
                }
                group={
                  archived.length > 0
                    ? {
                        label: quantify(archived.length, noun, archivedWord),
                        entries: archived,
                        expanded,
                        onToggle: table.toggleGroup,
                      }
                    : undefined
                }
                rowActions={(entry) => (
                  <button
                    type="button"
                    // 34 px comme la maquette sur un écran pointé, 44 px sur mobile : la
                    // maquette passe sous le plancher tactile que les non-négociables imposent,
                    // et le point de rupture est ce qui réconcilie les deux plutôt que d'avoir à
                    // choisir.
                    className="flex size-11 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-primary-xs hover:text-primary sm:size-[34px]"
                    aria-label={`Modifier ${labelOf(entry)}`}
                    onClick={(event) => {
                      onEdit(entry, event.currentTarget)
                    }}
                  >
                    <Pencil aria-hidden="true" className="size-4" />
                  </button>
                )}
              />
            )}
          </section>
        )
      ) : null}

      {panel}
    </>
  )
}
