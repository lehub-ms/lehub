import { useParams } from 'react-router'
import type { CommunitySummary } from '@/lib/api'
import { useCommunitiesValue } from './useAllowedCommunities'
import { findCommunity, findCommunityByRoute } from './useSelectedCommunity'

/**
 * La communauté que **la barre latérale** désigne, qui n'est pas celle de l'écran.
 *
 * Les deux notions étaient confondues, et c'était le défaut : la barre dérivait uniquement de
 * l'URL, donc sur un écran d'administration générale — qui ne porte aucune communauté — la
 * section « Évènements / Organisateurs » disparaissait et le sélecteur devenait muet. On se
 * retrouvait dans l'administration sans aucun chemin de retour.
 *
 * L'URL fait foi quand elle en porte une ; sinon la dernière retenue ; sinon la première
 * autorisée. La barre désigne donc toujours quelque chose d'atteignable, et le titre des écrans
 * continue de n'afficher une communauté que lorsque l'écran en a vraiment une.
 */
export function useActiveCommunity(): CommunitySummary | null {
  const { communitySlug } = useParams()
  const { state, preferredId } = useCommunitiesValue()
  if (state.status !== 'success') return null

  return (
    findCommunityByRoute(state.communities, communitySlug) ??
    findCommunity(state.communities, preferredId) ??
    state.communities[0] ??
    null
  )
}
