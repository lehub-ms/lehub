import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@lehub/shared/auth/useAuth'
import { useCommunities, type CommunitiesState } from '@/hooks/useCommunities'
import { readLastCommunityId, writeLastCommunityId } from '@/lib/preferences'
import { CommunitiesContext, type CommunitiesValue } from './CommunitiesContext'

/**
 * Charge les communautés et n'expose que celles que la session autorise : toutes pour un
 * administrateur global, celles dont elle est organisatrice sinon.
 *
 * Il porte aussi la communauté **retenue**, en état React et pas seulement en `localStorage`.
 * La nuance compte : sur un écran d'administration générale, l'URL ne porte aucune communauté,
 * et sans état réactif le choix de l'utilisateur n'aurait aucun effet visible — c'est
 * exactement le défaut constaté.
 *
 * La comparaison d'identifiants est insensible à la casse, comme côté serveur — `authz.ts` le
 * fait déjà, au motif qu'un écart de casse refuserait un organisateur sur sa propre communauté.
 */
export function CommunitiesProvider({ children }: { children: ReactNode }): ReactNode {
  const { state: session } = useAuth()
  const { refetch, ...fetched } = useCommunities()
  const [preferredId, setPreferredId] = useState<string | null>(readLastCommunityId)

  const permissions = session.status === 'authenticated' ? session.permissions : null

  const state = useMemo<CommunitiesState>(() => {
    if (fetched.status !== 'success' || !permissions) return fetched
    if (permissions.isGlobalAdmin) return fetched

    const organized = new Set(permissions.organizedCommunityIds.map((id) => id.toLowerCase()))
    return {
      status: 'success',
      communities: fetched.communities.filter((community) => organized.has(community.id.toLowerCase())),
    }
  }, [fetched, permissions])

  const selectCommunity = useCallback((communityId: string) => {
    setPreferredId(communityId)
    writeLastCommunityId(communityId)
  }, [])

  const value = useMemo<CommunitiesValue>(
    () => ({ state, preferredId, selectCommunity, retry: refetch }),
    [state, preferredId, selectCommunity, refetch],
  )

  return <CommunitiesContext.Provider value={value}>{children}</CommunitiesContext.Provider>
}
