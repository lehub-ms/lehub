import { useCallback, useEffect, useState } from 'react'

export type ReferenceListState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'success'; entries: T[] }

type Settled<T> = { token: number } & ({ entries: T[] } | { error: unknown })

/**
 * Une liste de référentiel, lue une fois par montage et rechargeable.
 *
 * Calqué sur `useCommunities`, y compris son astuce : l'état « en cours » est **dérivé au rendu**
 * en comparant les jetons plutôt que posé en tête d'effet, parce qu'un `setState` synchrone dans
 * un effet est refusé par `react-hooks/set-state-in-effect` et que le contourner par un drapeau
 * serait une façon compliquée de dire la même chose.
 *
 * Générique parce que les deux référentiels s'en servent à l'identique, et parce que #143 et #156
 * liront leurs propres listes de la même façon.
 *
 * `load` doit être stable — une fonction de module, jamais une lambda définie au rendu, qui
 * relancerait la lecture à chaque passe.
 */
export function useReferenceList<T>(
  load: () => Promise<T[]>,
): ReferenceListState<T> & { refetch: () => void } {
  const [settled, setSettled] = useState<Settled<T> | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false

    load()
      .then((entries) => {
        if (!cancelled) setSettled({ token: reloadToken, entries })
      })
      .catch((error: unknown) => {
        if (!cancelled) setSettled({ token: reloadToken, error })
      })

    return () => {
      cancelled = true
    }
  }, [load, reloadToken])

  const refetch = useCallback(() => {
    setReloadToken((token) => token + 1)
  }, [])

  if (!settled || settled.token !== reloadToken) return { status: 'loading', refetch }
  if ('error' in settled) return { status: 'error', error: settled.error, refetch }
  return { status: 'success', entries: settled.entries, refetch }
}
