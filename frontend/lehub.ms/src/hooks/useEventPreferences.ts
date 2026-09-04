import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@lehub/shared/auth/useAuth'
import { getMyPreferences, type EventPreferences } from '@/lib/api'

/**
 * `anonymous` est un état à part entière, et pas un `ready` sans préférences.
 *
 * Un visiteur ne voit pas la barre — ni vide, ni désactivée — et rien n'est demandé à l'API pour
 * lui. Les replier tous les deux sur « aucune préférence » ferait de la page connectée sans
 * sélection et de la page anonyme la même chose, alors que l'une propose d'enregistrer et
 * l'autre ne doit rien proposer du tout.
 */
export type EventPreferencesState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'ready'; preferences: EventPreferences }
  | { status: 'error' }

export interface EventPreferencesHandle {
  state: EventPreferencesState
  /**
   * Ce que la route d'enregistrement vient de renvoyer, adopté sans relire.
   *
   * La réponse du PUT *est* l'état enregistré — la relire ouvrirait une fenêtre où la barre
   * afficherait encore l'ancien état après une écriture réussie.
   */
  applySaved: (preferences: EventPreferences) => void
}

type Settled = { owner: string } & ({ preferences: EventPreferences } | { error: unknown })

/**
 * À qui appartient ce qui a été lu.
 *
 * Deux comptes successifs dans le même onglet ne doivent pas se voir l'un l'autre, fût-ce le
 * temps d'un rendu. Comparer ce propriétaire pendant le rendu, plutôt que remettre l'état à zéro
 * depuis un effet, évite le rendu intermédiaire où les préférences du précédent seraient encore
 * là — c'est la même technique que le jeton de rechargement de `useUpcomingEvents`.
 */
function ownerOf(auth: ReturnType<typeof useAuth>['state']): string {
  if (auth.status !== 'authenticated') return auth.status
  return auth.user?.objectId ?? 'authenticated'
}

export function useEventPreferences(): EventPreferencesHandle {
  const { state: auth } = useAuth()
  const owner = ownerOf(auth)
  const authenticated = auth.status === 'authenticated'
  const [settled, setSettled] = useState<Settled | null>(null)

  useEffect(() => {
    // Hors session, rien n'est demandé à l'API : un visiteur ne voit pas la barre, et une
    // requête qu'il ne peut pas satisfaire n'a rien à faire dans son onglet.
    if (!authenticated) return

    let cancelled = false

    getMyPreferences()
      .then((preferences) => {
        if (!cancelled) setSettled({ owner, preferences })
      })
      .catch((error: unknown) => {
        if (!cancelled) setSettled({ owner, error })
      })

    return () => {
      cancelled = true
    }
  }, [authenticated, owner])

  const applySaved = useCallback(
    (preferences: EventPreferences) => {
      setSettled({ owner, preferences })
    },
    [owner],
  )

  // Ce qui a été lu pour quelqu'un d'autre ne vaut pas pour celui-ci.
  const current = settled?.owner === owner ? settled : null

  // Une session encore en cours de restauration se lit comme un chargement, et non comme une
  // absence de session : c'est ce qui empêche la page de s'ouvrir sans filtre avant de se
  // rétracter une fois la session revenue.
  if (auth.status === 'loading') return { state: { status: 'loading' }, applySaved }
  if (!authenticated) return { state: { status: 'anonymous' }, applySaved }
  if (current === null) return { state: { status: 'loading' }, applySaved }
  if ('error' in current) return { state: { status: 'error' }, applySaved }

  return { state: { status: 'ready', preferences: current.preferences }, applySaved }
}
