import { useCallback, useEffect, useState } from 'react'

export type ReferenceListState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'success'; entries: T[] }

/**
 * Ce qui a été lu, et **par quelle lecture**.
 *
 * `load` autant que `token` : un jeton seul ne distingue pas deux lectures qui portent sur des
 * choses différentes. `OrganizersPage` reconstruit son `load` à partir de la communauté de
 * l'URL, et changer de communauté ne remonte pas l'écran — c'est la même route, seul le
 * paramètre bouge. Sans cette moitié, la table continuait d'afficher les organisateurs de la
 * communauté précédente pendant toute la lecture de la suivante, alors que les actions de ligne
 * visaient déjà la nouvelle : un retrait cliqué dans cette fenêtre partait sur la mauvaise
 * communauté, où l'API n'avait rien à retirer et répondait 204 — la personne restait désignée
 * et l'écran affirmait le contraire.
 */
type Settled<T> = { token: number; load: () => Promise<T[]> } & (
  | { entries: T[] }
  | { error: unknown }
)

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
 * `load` doit être stable — une fonction de module, ou un `useCallback` dont les dépendances
 * sont la portée lue, jamais une lambda définie au rendu, qui relancerait la lecture à chaque
 * passe. Le changer est un changement de portée : l'état repasse « en cours » plutôt que de
 * laisser voir le résultat de la portée précédente.
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
        if (!cancelled) setSettled({ token: reloadToken, load, entries })
      })
      .catch((error: unknown) => {
        if (!cancelled) setSettled({ token: reloadToken, load, error })
      })

    return () => {
      cancelled = true
    }
  }, [load, reloadToken])

  const refetch = useCallback(() => {
    setReloadToken((token) => token + 1)
  }, [])

  if (!settled || settled.token !== reloadToken || settled.load !== load) {
    return { status: 'loading', refetch }
  }
  if ('error' in settled) return { status: 'error', error: settled.error, refetch }
  return { status: 'success', entries: settled.entries, refetch }
}
