import type { ReactNode } from 'react'
import { CommunityAvatar } from '@lehub/shared/components/entities/CommunityAvatar'
import { useSelectedCommunity } from '@/community/useSelectedCommunity'

/**
 * Les écrans que cette Feature n'a pas à remplir.
 *
 * #138 construit la coquille ; le contenu appartient à #143 (évènements) et #156 (désignations
 * et administrateurs). #150 a livré les siens, qui ont quitté ce fichier. Une page provisoire nommée vaut mieux qu'une route absente : la
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

/**
 * Le titre d'un écran de la section porte la communauté sur laquelle on travaille.
 *
 * La story le demande, et c'est aussi ce qui rend le contexte lisible sans avoir à remonter
 * la barre latérale des yeux : la puce reprend la marque de la communauté, logo ou initiale.
 */
function ScopedPlaceholder({ title, issue }: { title: string; issue: string }): ReactNode {
  const community = useSelectedCommunity()

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-2xl font-bold">{title}</h1>
        {community ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/12 bg-white py-[3px] pr-3 pl-1.5 font-heading text-lg font-semibold text-primary">
            <CommunityAvatar community={community} size={24} hidden className="rounded-full" />
            {community.name}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-[0.9375rem] text-ink-muted">
        Cet écran est livré par {issue}. La navigation qui y mène est en place.
      </p>
    </>
  )
}

export function EventsPage(): ReactNode {
  return <ScopedPlaceholder title="Évènements" issue="la Feature #143" />
}

export function AdministratorsPage(): ReactNode {
  return <Placeholder title="Administrateurs" issue="la Feature #156" />
}
