import { createContext } from 'react'
import type { CommunitiesState } from '@/hooks/useCommunities'

export interface CommunitiesValue {
  /** Les communautés que la session peut piloter, déjà filtrées. */
  state: CommunitiesState
  /**
   * La communauté retenue hors URL — celle que la barre latérale continue de désigner sur un
   * écran d'administration générale, qui n'en porte aucune.
   */
  preferredId: string | null
  /** Retient une communauté et la rend immédiatement à l'écran, sans passer par le stockage. */
  selectCommunity: (communityId: string) => void
  /** Rejoue l'appel après un échec. La notice d'erreur promet un réessai ; le voici. */
  retry: () => void
}

/**
 * Les communautés que la session peut piloter, chargées une fois et distribuées.
 *
 * Un contexte plutôt qu'un appel par composant : `SidebarBody` est rendu deux fois — la barre
 * fixe et le tiroir —, donc un `useCommunities()` par instance ferait deux requêtes pour la
 * même liste. Les écrans de #143 la consommeront aussi, pour leurs titres.
 */
export const CommunitiesContext = createContext<CommunitiesValue | null>(null)
