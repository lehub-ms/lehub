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

/** Un identifiant, et rien d'autre : c'est ce qui interdit à un slug d'en imiter un. */
const GUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * La communauté que désigne le segment d'URL, qu'il porte un slug ou un identifiant.
 *
 * Un seul motif décide de la forme, avant toute recherche : la résolution n'hésite jamais entre
 * les deux, ce que #166 demande explicitement. Un slug ne peut pas ressembler à un identifiant —
 * `isValidSlug` le refuse à l'écriture — donc les deux ensembles sont disjoints.
 *
 * Les adresses portant un identifiant restent servies : elles ont été partagées avant #166, et
 * `CommunityScope` les ramène ensuite sur la forme canonique.
 */
export function findCommunityByRoute(
  communities: readonly CommunitySummary[],
  segment: string | null | undefined,
): CommunitySummary | null {
  if (!segment) return null
  if (GUID_SHAPE.test(segment)) return findCommunity(communities, segment)

  const wanted = segment.toLowerCase()
  return communities.find((community) => community.slug.toLowerCase() === wanted) ?? null
}

/**
 * La communauté **de l'écran courant** : celle que porte l'URL, et rien d'autre.
 *
 * Rend `null` sur un écran d'administration générale, ce qui est voulu — la story demande que
 * le titre de ces écrans ne porte pas de communauté, parce que les référentiels n'appartiennent
 * à aucune. Pour ce que la barre latérale doit désigner, voir `useActiveCommunity`.
 */
export function useSelectedCommunity(): CommunitySummary | null {
  const { communitySlug } = useParams()
  const { state } = useCommunitiesValue()
  if (state.status !== 'success') return null
  return findCommunityByRoute(state.communities, communitySlug)
}
