import type { ReactNode } from 'react'

/**
 * Les écrans que cette Feature n'a pas à remplir.
 *
 * #138 construit la coquille ; le contenu appartient à #143 (évènements), #150 (référentiels)
 * et #156 (désignations). Une page provisoire nommée vaut mieux qu'une route absente : la
 * navigation est vérifiable de bout en bout dès maintenant, et le remplacement est un
 * changement local plutôt qu'un ajout de route.
 */
function Placeholder({ title, issue }: { title: string; issue: string }): ReactNode {
  return (
    <>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-[0.9375rem] text-ink-muted">
        Cet écran est livré par {issue}. La navigation qui y mène est en place.
      </p>
    </>
  )
}

export function EventsPage(): ReactNode {
  return <Placeholder title="Évènements" issue="la Feature #143" />
}

export function OrganizersPage(): ReactNode {
  return <Placeholder title="Organisateurs" issue="la Feature #156" />
}

export function CommunitiesPage(): ReactNode {
  return <Placeholder title="Communautés" issue="la Feature #150" />
}

export function TechnologiesPage(): ReactNode {
  return <Placeholder title="Technologies" issue="la Feature #150" />
}

export function AdministratorsPage(): ReactNode {
  return <Placeholder title="Administrateurs" issue="la Feature #156" />
}
