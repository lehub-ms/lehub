import { useMemo, type ReactNode } from 'react'
import { useAuth } from '@lehub/shared/auth/useAuth'
import { useCommunities, type CommunitiesState } from '@/hooks/useCommunities'
import { CommunitiesContext } from './CommunitiesContext'

/**
 * Charge les communautés et n'expose que celles que la session autorise : toutes pour un
 * administrateur global, celles dont elle est organisatrice sinon.
 *
 * La comparaison d'identifiants est insensible à la casse, comme côté serveur — `authz.ts` le
 * fait déjà, au motif qu'un écart de casse refuserait un organisateur sur sa propre communauté.
 */
export function CommunitiesProvider({ children }: { children: ReactNode }): ReactNode {
  const { state: session } = useAuth()
  const fetched = useCommunities()

  const permissions = session.status === 'authenticated' ? session.permissions : null

  const value = useMemo<CommunitiesState>(() => {
    if (fetched.status !== 'success' || !permissions) return fetched
    if (permissions.isGlobalAdmin) return fetched

    const organized = new Set(permissions.organizedCommunityIds.map((id) => id.toLowerCase()))
    return {
      status: 'success',
      communities: fetched.communities.filter((community) => organized.has(community.id.toLowerCase())),
    }
  }, [fetched, permissions])

  return <CommunitiesContext.Provider value={value}>{children}</CommunitiesContext.Provider>
}
