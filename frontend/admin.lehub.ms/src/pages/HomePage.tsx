import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { CommunitiesNotice } from '@/components/CommunitiesNotice'
import { useAllowedCommunities } from '@/community/useAllowedCommunities'
import { findCommunity } from '@/community/useSelectedCommunity'
import { communityPath } from '@/lib/navigation'
import { readLastCommunityId } from '@/lib/preferences'

/**
 * L'entrée du backoffice n'est pas un écran, c'est une redirection.
 *
 * La Feature #138 est explicite : « l'entrée du backoffice mène aux évènements de cette
 * communauté — il n'y a pas d'écran d'accueil ». Laquelle ? La dernière utilisée, si la
 * session l'autorise encore, sinon la première. Cette préférence n'est jamais crue sur
 * parole : une désignation retirée depuis la dernière visite retombe sans bruit sur la
 * première communauté autorisée.
 */
export function HomePage(): ReactNode {
  const communities = useAllowedCommunities()

  if (communities.status === 'loading') return null
  if (communities.status === 'error') return <CommunitiesNotice kind="error" />

  const remembered = findCommunity(communities.communities, readLastCommunityId() ?? undefined)
  const target = remembered ?? communities.communities[0]
  if (!target) return <CommunitiesNotice kind="empty" />

  return <Navigate to={communityPath(target.id, 'evenements')} replace />
}
