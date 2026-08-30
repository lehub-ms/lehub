import { createContext } from 'react'
import type { CommunitiesState } from '@/hooks/useCommunities'

/**
 * Les communautés que la session peut piloter, chargées une fois et distribuées.
 *
 * Un contexte plutôt qu'un appel par composant : `SidebarBody` est rendu deux fois — la barre
 * fixe et le tiroir —, donc un `useCommunities()` par instance ferait deux requêtes pour la
 * même liste. Les écrans de #143 la consommeront aussi, pour leurs titres.
 */
export const CommunitiesContext = createContext<CommunitiesState | null>(null)
