import { ArrowRight, CalendarDays, CalendarX } from 'lucide-react'
import { CalendarCard } from '@/components/CalendarCard'
import { CommunitiesCarousel } from '@/components/CommunitiesCarousel'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { EventCard } from '@/components/events/EventCard'
import { EventCardSkeleton } from '@/components/events/EventCardSkeleton'
import { LinkButton } from '@/components/LinkButton'
import { useUpcomingEvents } from '@/hooks/useUpcomingEvents'
import { PATHS } from '@/lib/navigation'

const HOME_EVENT_COUNT = 3

export function HomePage() {
  const upcoming = useUpcomingEvents()

  return (
    <div className="flex flex-col gap-20 pb-8">
      <section className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
        <div className="max-w-2xl">
          <h1 className="text-4xl leading-tight font-bold tracking-tight md:text-5xl">
            <span className="text-gradient">LeHub</span>
            <span className="mt-3 block text-2xl font-bold text-ink md:text-4xl">
              des communautés Microsoft Francophones
            </span>
          </h1>

          <p className="mt-6 text-lg leading-relaxed text-ink-muted text-pretty">
            LeHub centralise tous les évènements des communautés Microsoft francophones :
            conférences, meetups, webinaires. Un seul endroit pour trouver toute l’activité
            communautaire.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <LinkButton to={PATHS.events}>
              <CalendarDays aria-hidden="true" className="size-[18px]" />
              Voir les évènements
            </LinkButton>
            <LinkButton to={PATHS.hub} variant="outline">
              Découvrir LeHub
              <ArrowRight aria-hidden="true" className="size-4" />
            </LinkButton>
          </div>
        </div>

        <CalendarCard />
      </section>

      <section aria-labelledby="prochains-evenements">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <h2 id="prochains-evenements" className="text-3xl font-bold md:text-4xl">
            Les prochains évènements
          </h2>
          <LinkButton to={PATHS.events} variant="outline" className="text-sm">
            Tout voir
            <ArrowRight aria-hidden="true" className="size-4" />
          </LinkButton>
        </div>

        {upcoming.status === 'loading' && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: HOME_EVENT_COUNT }, (_, index) => (
              <EventCardSkeleton key={index} />
            ))}
          </div>
        )}

        {upcoming.status === 'error' && <ErrorState error={upcoming.error} onRetry={upcoming.refetch} />}

        {upcoming.status === 'success' &&
          (upcoming.events.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {upcoming.events.slice(0, HOME_EVENT_COUNT).map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CalendarX}
              title="Aucun évènement à venir pour le moment"
              description="Revenez bientôt : les communautés annoncent régulièrement de nouveaux évènements."
            />
          ))}
      </section>

      <section aria-labelledby="communautes-partenaires">
        <h2 id="communautes-partenaires" className="mb-8 text-center text-3xl font-bold md:text-4xl">
          Les communautés partenaires
        </h2>
        <CommunitiesCarousel />
      </section>
    </div>
  )
}
