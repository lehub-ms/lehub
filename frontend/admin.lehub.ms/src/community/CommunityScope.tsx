import { useEffect, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useParams } from 'react-router'
import { CommunitiesNotice } from '@/components/CommunitiesNotice'
import { communityPath, PATHS } from '@/lib/navigation'
import { useCommunitiesValue } from './useAllowedCommunities'
import { findCommunity } from './useSelectedCommunity'

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
  const { communityId } = useParams()
  const { pathname } = useLocation()
  const { state: communities, selectCommunity } = useCommunitiesValue()

  const matched =
    communities.status === 'success' ? findCommunity(communities.communities, communityId) : null

  useEffect(() => {
    if (matched) selectCommunity(matched.id)
  }, [matched, selectCommunity])

  if (communities.status === 'loading') return null
  if (communities.status === 'error') return <CommunitiesNotice kind="error" />

  const first = communities.communities[0]
  // Habilité mais aucune communauté à piloter : l'entrée du backoffice le dira, plutôt que de
  // renvoyer ici vers une communauté qui n'existe pas.
  if (!first) return <Navigate to={PATHS.home} replace />
  if (!matched) return <Navigate to={communityPath(first.id, 'evenements')} replace />

  /* Une URL par communauté, et une seule. SQL Server rend ses `UNIQUEIDENTIFIER` en majuscules
     tandis qu'un lien copié à la main peut porter n'importe quelle casse ; la résolution est
     insensible à la casse, mais tout ce qui compare des chemins ne l'est pas — le marquage de
     l'entrée courante s'y perdait. Plutôt que de rendre chaque comparaison tolérante, l'URL est
     ramenée à sa forme canonique une fois pour toutes, ce qui rejoint la règle du site public :
     un chemin canonique par écran. */
  if (communityId && matched.id !== communityId) {
    return <Navigate to={pathname.replace(`/c/${communityId}`, `/c/${matched.id}`)} replace />
  }

  return <Outlet />
}
