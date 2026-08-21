import { FeaturesShowcase } from '@/components/FeaturesShowcase'
import { AboutSection } from '@/components/AboutSection'

export function LeHubPage() {
  return (
    <div className="max-w-[57.5rem] pb-8">
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
        Les fonctionnalités LeHub
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-muted text-pretty">
        Un seul endroit pour suivre les évènements des communautés Microsoft francophones,
        pour ne rien manquer !
      </p>

      <FeaturesShowcase />
      <AboutSection />
    </div>
  )
}
