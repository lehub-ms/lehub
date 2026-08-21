import { ArrowRight, CalendarDays } from 'lucide-react'
import { CalendarCard } from '@/components/CalendarCard'
import { LinkButton } from '@/components/LinkButton'
import { PATHS } from '@/lib/navigation'
import { Placeholder } from '@/components/Placeholder'

export function HomePage() {
  return (
    <div className="flex flex-col gap-20 pb-8">
      <section className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
        <div>
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
        <h2 id="prochains-evenements" className="mb-8 text-3xl font-bold md:text-4xl">
          Les prochains évènements
        </h2>
        <Placeholder>Les prochains évènements s’afficheront ici très bientôt.</Placeholder>
      </section>

      <section aria-labelledby="communautes-partenaires">
        <h2 id="communautes-partenaires" className="mb-8 text-3xl font-bold md:text-4xl">
          Les communautés partenaires
        </h2>
        <Placeholder>Les communautés partenaires s’afficheront ici très bientôt.</Placeholder>
      </section>
    </div>
  )
}
