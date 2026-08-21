import { Placeholder } from '@/components/Placeholder'

export function LeHubPage() {
  return (
    <div className="max-w-4xl pb-8">
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
        Les fonctionnalités LeHub
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-muted text-pretty">
        Un seul endroit pour suivre les évènements des communautés Microsoft francophones,
        pour ne rien manquer !
      </p>

      <div className="mt-10">
        <Placeholder>
          La présentation détaillée des fonctionnalités arrive très bientôt.
        </Placeholder>
      </div>
    </div>
  )
}
