import { useEffect, type ReactNode } from 'react'
import { Navigate, Outlet, useParams } from 'react-router'
import { CommunitiesNotice } from '@/components/CommunitiesNotice'
import { communityPath, PATHS } from '@/lib/navigation'
import { writeLastCommunityId } from '@/lib/preferences'
import { useAllowedCommunities } from './useAllowedCommunities'
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
  const communities = useAllowedCommunities()

  const matched =
    communities.status === 'success' ? findCommunity(communities.communities, communityId) : null

  useEffect(() => {
    if (matched) writeLastCommunityId(matched.id)
  }, [matched])

  if (communities.status === 'loading') return null
  if (communities.status === 'error') return <CommunitiesNotice kind="error" />

  const first = communities.communities[0]
  // Habilité mais aucune communauté à piloter : l'entrée du backoffice le dira, plutôt que de
  // renvoyer ici vers une communauté qui n'existe pas.
  if (!first) return <Navigate to={PATHS.home} replace />
  if (!matched) return <Navigate to={communityPath(first.id, 'evenements')} replace />

  return <Outlet />
}
