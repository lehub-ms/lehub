import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { CalendarDays, Pencil, Plus, SearchX } from 'lucide-react'
import { CommunityAvatar } from '@lehub/shared/components/entities/CommunityAvatar'
import { EmptyState } from '@lehub/shared/components/EmptyState'
import { ErrorState } from '@lehub/shared/components/ErrorState'
import { LinkButton } from '@lehub/shared/components/LinkButton'
import { DataTable, type Column } from '@/components/data/DataTable'
import { ResultCount } from '@/components/data/ResultCount'
import { SearchField } from '@/components/data/SearchField'
import { EventThumb } from '@/components/events/EventThumb'
import { useSelectedCommunity } from '@/community/useSelectedCommunity'
import { useReferenceList } from '@/hooks/useReferenceList'
import { listCommunityEvents, type AdminEvent } from '@/lib/api'
import { eventDateParts, eventTimestamp } from '@/lib/eventDates'
import { eventPath, newEventPath } from '@/lib/navigation'
import {
  nextSort,
  searchEntries,
  sortEntries,
  type Comparable,
  type SortState,
} from '@/lib/referenceFilters'

type ColumnKey = 'title' | 'startDate' | 'endDate' | 'mode'

const NOUN = { one: 'évènement', many: 'évènements' }

/**
 * Ce sur quoi la recherche porte : le titre et la description (#144).
 *
 * Au niveau du module, comme dans les écrans de référentiel : la fonction entre dans les
 * dépendances d'un `useMemo`, et une lambda définie au rendu le relancerait à chaque passe.
 */
function searchableOf(event: AdminEvent): readonly (string | null)[] {
  return [event.title, event.description]
}

/**
 * La valeur triable d'une colonne.
 *
 * Les deux dates rendent un nombre et non leur chaîne ISO : `referenceFilters` compare les
 * chaînes avec `localeCompare`, dont l'ordre sur des dates ne coïncide avec celui du temps que
 * par accident de format.
 */
function valueOf(event: AdminEvent, key: ColumnKey): Comparable {
  if (key === 'startDate') return eventTimestamp(event.startDate)
  if (key === 'endDate') return eventTimestamp(event.endDate)
  return event[key]
}

/** Une cellule de date : le jour en évidence, le jour de la semaine et l'heure en dessous. */
function DateCell({ iso }: { iso: string }): ReactNode {
  const parts = eventDateParts(iso)
  if (!parts) return <span className="text-ink-muted">—</span>

  return (
    <span className="flex flex-col leading-[1.35]">
      {/* `<time>` porte la valeur lisible par une machine ; le texte reste celui du fuseau
          Europe/Paris, que l'attribut n'a pas à répéter. */}
      <time dateTime={iso} className="font-heading text-[0.9375rem] font-semibold whitespace-nowrap text-ink">
        {parts.day}
      </time>
      <span className="text-[0.8125rem] whitespace-nowrap text-ink-muted">{parts.detail}</span>
    </span>
  )
}

export function EventsPage(): ReactNode {
  const community = useSelectedCommunity()
  const communityId = community?.id ?? null

  /* La lecture dépend de la communauté, donc `useCallback` sur elle : changer de communauté dans
     la barre latérale change l'identité de `load`, ce que `useReferenceList` observe pour
     recharger. « Changer de communauté recharge la liste » (#144) tombe de là, sans effet écrit
     à la main. */
  const load = useCallback(
    () => (communityId ? listCommunityEvents(communityId) : Promise.resolve<AdminEvent[]>([])),
    [communityId],
  )
  const state = useReferenceList(load)

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState<ColumnKey>>({
    key: 'startDate',
    direction: 'ascending',
  })

  const entries = state.status === 'success' ? state.entries : null

  /* Recherche puis tri : trier ce qu'on s'apprête à jeter est du travail perdu. */
  const visible = useMemo(
    () => (entries ? sortEntries(searchEntries(entries, query, searchableOf), sort, valueOf) : []),
    [entries, query, sort],
  )

  const newPath = community ? newEventPath(community.slug) : null

  const columns: readonly Column<AdminEvent, ColumnKey>[] = useMemo(
    () => [
      {
        key: 'title',
        header: 'Évènement',
        sortable: true,
        render: (event) => (
          <Link
            to={community ? eventPath(community.slug, event.id) : '.'}
            className="flex min-w-0 items-center gap-3 text-ink hover:text-primary"
          >
            <EventThumb bannerImageUrl={event.bannerImageUrl} />
            <span className="truncate font-semibold">{event.title}</span>
          </Link>
        ),
      },
      { key: 'startDate', header: 'Début', sortable: true, width: '11rem', render: (event) => <DateCell iso={event.startDate} /> },
      { key: 'endDate', header: 'Fin', sortable: true, width: '11rem', render: (event) => <DateCell iso={event.endDate} /> },
      {
        key: 'mode',
        header: 'Format',
        sortable: true,
        width: '9rem',
        // `mode` et non `format` : le contrat nomme `mode` ce que l'écran appelle « Format ».
        // Voir `AdminEvent` dans lib/api.
        render: (event) => (
          <span className="inline-flex items-center rounded-full bg-primary-xs px-2.5 py-1 text-[0.8125rem] font-semibold text-primary">
            {event.mode}
          </span>
        ),
      },
    ],
    [community],
  )

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold">Évènements</h1>
            {community ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/12 bg-white py-[3px] pr-3 pl-1.5 font-heading text-lg font-semibold text-primary">
                <CommunityAvatar community={community} size={24} hidden className="rounded-full" />
                {community.name}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-[0.9375rem] text-ink-muted">
            Créez et gérez les évènements publiés sur lehub.ms.
          </p>
        </div>
        {newPath ? (
          <LinkButton to={newPath}>
            <Plus aria-hidden="true" className="size-[18px]" />
            Nouvel évènement
          </LinkButton>
        ) : null}
      </header>

      {state.status === 'loading' ? (
        <p role="status" className="mt-8 text-[0.9375rem] text-ink-muted">
          Chargement…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <div className="mt-8">
          <ErrorState
            title="Impossible de charger les évènements"
            error={state.error}
            onRetry={state.refetch}
          />
        </div>
      ) : null}

      {entries ? (
        entries.length === 0 ? (
          // Communauté sans évènement : distinct d'une recherche infructueuse, parce que ce
          // n'est pas le même problème et que la sortie n'est pas la même (#144).
          <div className="mt-8">
            <EmptyState
              icon={CalendarDays}
              title="Aucun évènement pour cette communauté"
              description="Créez-en un : il apparaîtra sur lehub.ms sans passer par un déploiement."
              {...(newPath ? { action: { label: 'Nouvel évènement', to: newPath } } : {})}
            />
          </div>
        ) : (
          <section className="glass mt-8 rounded-2xl p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <SearchField
                label="Rechercher un évènement…"
                placeholder="Rechercher un évènement…"
                value={query}
                onChange={setQuery}
              />
              <ResultCount
                activeCount={visible.length}
                archivedCount={0}
                noun={NOUN}
                archivedWord={{ one: 'passé', many: 'passés' }}
              />
            </div>

            {visible.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title={`Aucun résultat pour « ${query} »`}
                description="Vérifiez l’orthographe, ou effacez la recherche pour retrouver la liste complète."
                action={{
                  label: 'Afficher tous les évènements',
                  onClick: () => {
                    setQuery('')
                  },
                }}
              />
            ) : (
              <DataTable
                caption="Évènements de la communauté"
                columns={columns}
                entries={visible}
                getRowId={(event) => event.id}
                sort={sort}
                onSortChange={(key) => {
                  setSort((current) => nextSort(current, key))
                }}
                rowActions={(event) =>
                  community ? (
                    <Link
                      to={eventPath(community.slug, event.id)}
                      // 34 px sur écran pointé comme la maquette, 44 px sur mobile : le plancher
                      // tactile des non-négociables l'emporte là où la maquette passe dessous.
                      className="flex size-11 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-primary-xs hover:text-primary sm:size-[34px]"
                      aria-label={`Modifier ${event.title}`}
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                    </Link>
                  ) : null
                }
              />
            )}
          </section>
        )
      ) : null}
    </>
  )
}
