import { useParams } from 'react-router'
import type { CommunitySummary } from '@/lib/api'
import { useCommunitiesValue } from './useAllowedCommunities'

/** Insensible à la casse, comme la comparaison d'identifiants côté serveur (`authz.ts`). */
export function findCommunity(
  communities: readonly CommunitySummary[],
  id: string | null | undefined,
): CommunitySummary | null {
  if (!id) return null
  const wanted = id.toLowerCase()
  return communities.find((community) => community.id.toLowerCase() === wanted) ?? null
}

/**
 * La communauté **de l'écran courant** : celle que porte l'URL, et rien d'autre.
 *
 * Rend `null` sur un écran d'administration générale, ce qui est voulu — la story demande que
 * le titre de ces écrans ne porte pas de communauté, parce que les référentiels n'appartiennent
 * à aucune. Pour ce que la barre latérale doit désigner, voir `useActiveCommunity`.
 */
export function useSelectedCommunity(): CommunitySummary | null {
  const { communityId } = useParams()
  const { state } = useCommunitiesValue()
  if (state.status !== 'success') return null
  return findCommunity(state.communities, communityId)
}
