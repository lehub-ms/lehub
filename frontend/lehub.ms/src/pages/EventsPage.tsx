import { Placeholder } from '@/components/Placeholder'

export function EventsPage() {
  return (
    <div className="pb-8">
      <h1 className="text-4xl font-bold tracking-tight md:text-[2.5rem]">
        Évènements à venir
      </h1>
      <p className="mt-3 max-w-xl text-ink-muted">
        Tous les évènements des communautés Microsoft francophones, classés par ordre
        chronologique.
      </p>

      {/* The grid, the community/technology filters and their mobile drawer belong to
          the Évènements feature, not to this navigation shell. */}
      <div className="mt-10">
        <Placeholder>La liste des évènements et ses filtres arrivent très bientôt.</Placeholder>
      </div>
    </div>
  )
}
