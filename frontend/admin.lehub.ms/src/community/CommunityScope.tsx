import { useEffect, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useParams } from 'react-router'
import { CommunitiesNotice } from '@/components/CommunitiesNotice'
import { communityPath, PATHS } from '@/lib/navigation'
import { useCommunitiesValue } from './useAllowedCommunities'
import { findCommunityByRoute } from './useSelectedCommunity'

/**
 * La garde de la section communauté : elle vérifie que l'URL en désigne une que la session
 * peut piloter, et retient laquelle pour la prochaine visite.
 *
 * Une communauté inconnue, ou dont la désignation a été retirée depuis, **retombe sur la
 * première autorisée sans erreur** — l'edge case de la story le demande ainsi, et ce serait
 * de toute façon un mauvais endroit pour opposer un refus : ce n'est pas la barrière. Une
 * écriture sur une communauté qu'on n'organise pas est refusée par l'API (#109), qu'on soit
 * passé par cet écran ou non.
 */
export function CommunityScope(): ReactNode {
  const { communitySlug } = useParams()
  const { pathname } = useLocation()
  const { state: communities, selectCommunity } = useCommunitiesValue()

  const matched =
    communities.status === 'success'
      ? findCommunityByRoute(communities.communities, communitySlug)
      : null

  useEffect(() => {
    if (matched) selectCommunity(matched.id)
  }, [matched, selectCommunity])

  if (communities.status === 'loading') return null
  if (communities.status === 'error') return <CommunitiesNotice kind="error" />

  const first = communities.communities[0]
  // Habilité mais aucune communauté à piloter : l'entrée du backoffice le dira, plutôt que de
  // renvoyer ici vers une communauté qui n'existe pas.
  if (!first) return <Navigate to={PATHS.home} replace />
  if (!matched) return <Navigate to={communityPath(first.slug, 'evenements')} replace />

  /* Une URL par communauté, et une seule. La forme canonique est le slug depuis #166 ; tout ce
     qui résout aussi — un identifiant partagé avant, une casse recopiée de travers — arrive ici
     et repart dessus. C'est le même mécanisme qui ramenait déjà la casse des identifiants, et
     c'est ce qui fait qu'« une adresse portant encore un identifiant continue de fonctionner et
     amène sur la forme canonique » ne demande aucune redirection supplémentaire.

     Plutôt que de rendre chaque comparaison de chemin tolérante — le marquage de l'entrée
     courante s'y perdait — l'URL est normalisée une fois pour toutes, ce qui rejoint la règle du
     site public : un chemin canonique par écran. */
  if (communitySlug && matched.slug !== communitySlug) {
    return <Navigate to={pathname.replace(`/c/${communitySlug}`, `/c/${matched.slug}`)} replace />
  }

  return <Outlet />
}
