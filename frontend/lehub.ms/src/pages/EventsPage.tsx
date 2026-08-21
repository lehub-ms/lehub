import { CalendarX } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { EventCard } from '@/components/events/EventCard'
import { EventCardSkeleton } from '@/components/events/EventCardSkeleton'
import { useUpcomingEvents } from '@/hooks/useUpcomingEvents'

function countLabel(count: number): string {
  return count === 0
    ? 'Aucun évènement disponible'
    : `${count} évènement${count > 1 ? 's' : ''} disponible${count > 1 ? 's' : ''}`
}

export function EventsPage() {
  const upcoming = useUpcomingEvents()
  const events = upcoming.status === 'success' ? upcoming.events : []

  return (
    <div className="pb-8">
      <h1 className="text-4xl font-bold tracking-tight md:text-[2.5rem]">
        Évènements à venir
      </h1>
      <p className="mt-3 max-w-xl text-ink-muted">
        Tous les évènements des communautés Microsoft francophones, classés par ordre
        chronologique.
      </p>
      {upcoming.status === 'success' && (
        <p aria-live="polite" className="mt-1 text-sm text-ink-muted">
          {countLabel(events.length)}
        </p>
      )}

      <div className="mt-10">
        {/* The community/technology filter panel and its mobile drawer belong to
            stories #20-#22, not to this base listing. */}
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
          (events.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 md:[grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <EmptyState icon={CalendarX} title="Aucun évènement à venir pour le moment" />
          ))}
      </div>
    </div>
  )
}
