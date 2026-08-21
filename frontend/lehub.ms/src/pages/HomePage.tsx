import { ArrowRight, CalendarDays } from 'lucide-react'
import { LinkButton } from '@/components/LinkButton'
import { Placeholder } from '@/components/Placeholder'

export function HomePage() {
  return (
    <div className="flex flex-col gap-20 pb-8">
      {/* The mock-up pairs this hero with a "your personal calendar" card that sells
          account creation. That column stays out until authentication is specified. */}
      <section className="max-w-2xl">
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
          <LinkButton to="/evenements">
            <CalendarDays aria-hidden="true" className="size-[18px]" />
            Voir les évènements
          </LinkButton>
          <LinkButton to="/lehub" variant="outline">
            Découvrir LeHub
            <ArrowRight aria-hidden="true" className="size-4" />
          </LinkButton>
        </div>
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
