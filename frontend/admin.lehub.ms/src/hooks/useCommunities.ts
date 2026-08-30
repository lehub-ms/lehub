import { useCallback, useEffect, useState } from 'react'
import { listCommunities, type CommunitySummary } from '@/lib/api'

export type CommunitiesState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'success'; communities: CommunitySummary[] }

type Settled = { token: number } & ({ communities: CommunitySummary[] } | { error: unknown })

/**
 * La liste des communautés, lue une fois par montage.
 *
 * Calqué sur `useUpcomingEvents` du site public, y compris son astuce : l'état « en cours »
 * est **dérivé au rendu** en comparant les jetons, plutôt que posé en tête d'effet. Un
 * `setState` synchrone dans un effet est refusé par la règle `react-hooks/set-state-in-effect`,
 * et le contourner par un drapeau serait une façon compliquée de dire la même chose.
 *
 * La route est publique : le filtrage par habilitation qui suit est un confort d'affichage,
 * jamais une protection. Ces données sont lisibles de tous par construction, et c'est l'API
 * qui refuse les écritures (#109).
 */
export function useCommunities(): CommunitiesState & { refetch: () => void } {
  const [settled, setSettled] = useState<Settled | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false

    listCommunities()
      .then((communities) => {
        if (!cancelled) setSettled({ token: reloadToken, communities })
      })
      .catch((error: unknown) => {
        if (!cancelled) setSettled({ token: reloadToken, error })
      })

    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const refetch = useCallback(() => {
    setReloadToken((token) => token + 1)
  }, [])

  if (!settled || settled.token !== reloadToken) return { status: 'loading', refetch }
  if ('error' in settled) return { status: 'error', error: settled.error, refetch }
  return { status: 'success', communities: settled.communities, refetch }
}
