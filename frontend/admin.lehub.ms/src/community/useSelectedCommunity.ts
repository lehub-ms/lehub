import { useParams } from 'react-router'
import type { CommunitySummary } from '@/lib/api'
import { useAllowedCommunities } from './useAllowedCommunities'

/** Insensible à la casse, comme la comparaison d'identifiants côté serveur (`authz.ts`). */
export function findCommunity(
  communities: readonly CommunitySummary[],
  id: string | undefined,
): CommunitySummary | null {
  if (!id) return null
  const wanted = id.toLowerCase()
  return communities.find((community) => community.id.toLowerCase() === wanted) ?? null
}

/**
 * La communauté de l'écran courant, ou `null` — hors de la section communauté, pendant le
 * chargement de la liste, ou lorsque l'URL en désigne une que la session n'a pas.
 */
export function useSelectedCommunity(): CommunitySummary | null {
  const { communityId } = useParams()
  const communities = useAllowedCommunities()
  if (communities.status !== 'success') return null
  return findCommunity(communities.communities, communityId)
}
