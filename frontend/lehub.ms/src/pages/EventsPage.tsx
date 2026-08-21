import { useMemo, useState } from 'react'
import { CalendarX, SearchX } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { EventCard } from '@/components/events/EventCard'
import { EventCardSkeleton } from '@/components/events/EventCardSkeleton'
import { EventFilterDrawer } from '@/components/events/EventFilterDrawer'
import { EventFilterPanel } from '@/components/events/EventFilterPanel'
import { useUpcomingEvents } from '@/hooks/useUpcomingEvents'
import {
  applyEventFilters,
  deriveFilterOptions,
  EMPTY_FILTER_SELECTION,
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
  const [selection, setSelection] = useState<EventFilterSelection>(EMPTY_FILTER_SELECTION)

  const events = upcoming.status === 'success' ? upcoming.events : NO_EVENTS
  // Always derived from the FULL upcoming set — never from `visibleEvents` — so each
  // dimension's option list stays independent of the other dimension's active filter.
  const options = useMemo(() => deriveFilterOptions(events), [events])
  const visibleEvents = useMemo(() => applyEventFilters(events, selection), [events, selection])

  function resetFilters() {
    setSelection(EMPTY_FILTER_SELECTION)
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
          {upcoming.status === 'success' && (
            <p aria-live="polite" className="mt-1 text-sm text-ink-muted">
              {countLabel(visibleEvents.length)}
            </p>
          )}
        </div>

        {upcoming.status === 'success' && (
          <EventFilterDrawer
            options={options}
            selection={selection}
            onChange={setSelection}
            onReset={resetFilters}
          />
        )}
      </div>

      <div className="mt-10 flex items-start gap-8">
        <div className="min-w-0 flex-1">
          {/* Filter mechanics live in EventFilterPanel/EventFilterDrawer — this h2 only
              restores h1 → h2 → h3 nesting since each card's title is an h3. */}
          <h2 className="sr-only">Liste des évènements</h2>

          {upcoming.status === 'loading' && (
            <div className="grid grid-cols-1 gap-6 md:[grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
              {Array.from({ length: 6 }, (_, index) => (
                <EventCardSkeleton key={index} />
              ))}
            </div>
          )}

          {upcoming.status === 'error' && <ErrorState error={upcoming.error} onRetry={upcoming.refetch} />}

          {upcoming.status === 'success' &&
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

        {upcoming.status === 'success' && (
          <EventFilterPanel options={options} selection={selection} onChange={setSelection} onReset={resetFilters} />
        )}
      </div>
    </div>
  )
}
