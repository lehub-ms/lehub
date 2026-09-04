import { useMemo, useState } from 'react'
import { CalendarX, SearchX } from 'lucide-react'
import { EmptyState } from '@lehub/shared/components/EmptyState'
import { ErrorState } from '@lehub/shared/components/ErrorState'
import { EventCard } from '@/components/events/EventCard'
import { EventCardSkeleton } from '@/components/events/EventCardSkeleton'
import { EventFilterDrawer } from '@/components/events/EventFilterDrawer'
import { EventFilterPanel } from '@/components/events/EventFilterPanel'
import { useEventPreferences } from '@/hooks/useEventPreferences'
import { useUpcomingEvents } from '@/hooks/useUpcomingEvents'
import {
  applyEventFilters,
  deriveFilterOptions,
  EMPTY_FILTER_SELECTION,
  selectionFromRefs,
  type EventFilterSelection,
} from '@/lib/eventFilters'
import type { EventSummary } from '@/lib/api'

function countLabel(count: number): string {
  return count === 0
    ? 'Aucun évènement disponible'
    : `${count} évènement${count > 1 ? 's' : ''} disponible${count > 1 ? 's' : ''}`
}

// A single stable reference, so `options`/`visibleEvents` below don't recompute on
// every render while loading or errored — only a real event list ever changes them.
const NO_EVENTS: EventSummary[] = []

export function EventsPage() {
  const upcoming = useUpcomingEvents()
  const preferences = useEventPreferences()
  const preferencesState = preferences.state

  /**
   * La sélection enregistrée du compte, ou aucun filtre.
   *
   * Hors session, en erreur, ou sans préférence enregistrée : aucun filtre. Une sélection
   * enregistrée vide y mène aussi, et c'est son sens — pas un échec.
   */
  const savedSelection = useMemo(
    () =>
      preferencesState.status === 'ready' && preferencesState.preferences.saved
        ? selectionFromRefs(
            preferencesState.preferences.communities,
            preferencesState.preferences.technologies,
          )
        : EMPTY_FILTER_SELECTION,
    [preferencesState],
  )

  /**
   * Ce que l'utilisateur a réglé depuis, ou `null` s'il n'a encore rien touché.
   *
   * Dérivée plutôt que semée par un effet : initialiser à vide puis corriger une fois les
   * préférences arrivées, c'est peindre la liste entière avant de la réduire — le clignotement
   * que #192 interdit, qui dit à l'utilisateur que ses préférences ont été ignorées juste avant
   * de le démentir. Ici la sélection *est* l'enregistré tant que personne n'a rien changé, donc
   * il n'y a aucun instant où elle vaut autre chose.
   *
   * `null` a une seconde vertu, dont #193 se sert : revenir à la sélection enregistrée, c'est
   * remettre `null`, et cela la restaure exactement — sans copie à comparer.
   */
  const [override, setOverride] = useState<EventFilterSelection | null>(null)
  const selection = override ?? savedSelection

  const events = upcoming.status === 'success' ? upcoming.events : NO_EVENTS
  // Always derived from the FULL upcoming set — never from `visibleEvents` — so each
  // dimension's option list stays independent of the other dimension's active filter.
  const options = useMemo(() => deriveFilterOptions(events), [events])
  const visibleEvents = useMemo(
    () => applyEventFilters(events, selection),
    [events, selection],
  )

  /**
   * Une seule porte pour les deux chargements.
   *
   * Le compteur, le badge du tiroir, le panneau et la liste passent tous derrière, donc aucun
   * n'annonce un nombre qu'il corrigera. Les deux requêtes partent bien en parallèle : seule la
   * peinture attend, et elle attend au plus le petit aller-retour des préférences.
   */
  const ready = upcoming.status === 'success' && preferencesState.status !== 'loading'

  function resetFilters() {
    setOverride(EMPTY_FILTER_SELECTION)
  }

  return (
    <div className="pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight md:text-[2.5rem]">
            Évènements à venir
          </h1>
          <p className="mt-3 max-w-xl text-ink-muted">
            Tous les évènements des communautés Microsoft francophones, classés par ordre
            chronologique.
          </p>
          {ready && (
            <p aria-live="polite" className="mt-1 text-sm text-ink-muted">
              {countLabel(visibleEvents.length)}
            </p>
          )}
          {/* N'affirme rien sur l'état des préférences : dire « aucune préférence enregistrée »
              alors qu'on n'a pas pu les lire serait faux, et proposer de les enregistrer
              effacerait celles qui existent peut-être. */}
          {preferencesState.status === 'error' && (
            <p role="status" className="mt-1 text-sm text-ink-muted">
              Vos préférences n’ont pas pu être chargées.
            </p>
          )}
        </div>

        {ready && (
          <EventFilterDrawer
            options={options}
            selection={selection}
            onChange={setOverride}
            onReset={resetFilters}
          />
        )}
      </div>

      <div className="mt-10 flex items-start gap-8">
        <div className="min-w-0 flex-1">
          {/* Filter mechanics live in EventFilterPanel/EventFilterDrawer — this h2 only
              restores h1 → h2 → h3 nesting since each card's title is an h3. */}
          <h2 className="sr-only">Liste des évènements</h2>

          {/* Les squelettes couvrent aussi l'attente des préférences. Rien de neuf à l'écran :
              c'est le même état de chargement, simplement tenu jusqu'à ce que la sélection soit
              connue — ce qui est exactement ce qui empêche la liste non filtrée d'apparaître. */}
          {!ready && upcoming.status !== 'error' && (
            <div className="grid grid-cols-1 gap-6 md:[grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
              {Array.from({ length: 6 }, (_, index) => (
                <EventCardSkeleton key={index} />
              ))}
            </div>
          )}

          {upcoming.status === 'error' && <ErrorState title="Impossible de charger les évènements" error={upcoming.error} onRetry={upcoming.refetch} />}

          {ready &&
            (events.length === 0 ? (
              <EmptyState icon={CalendarX} title="Aucun évènement à venir pour le moment" />
            ) : visibleEvents.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="Aucun évènement ne correspond à vos filtres"
                action={{ label: 'Réinitialiser les filtres', onClick: resetFilters }}
              />
            ) : (
              <div className="grid grid-cols-1 gap-6 md:[grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
                {visibleEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            ))}
        </div>

        {ready && (
          <EventFilterPanel options={options} selection={selection} onChange={setOverride} onReset={resetFilters} />
        )}
      </div>
    </div>
  )
}
