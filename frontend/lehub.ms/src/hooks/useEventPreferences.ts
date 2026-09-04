import { useCallback, useEffect, useMemo, useState } from 'react'
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

/** Au-delà, la page cesse d'attendre les préférences et s'ouvre sans filtre. */
const PREFERENCES_TIMEOUT_MS = 8000

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
    const settle = (value: Settled) => {
      if (!cancelled) setSettled(value)
    }

    getMyPreferences()
      .then((preferences) => {
        settle({ owner, preferences })
      })
      .catch((error: unknown) => {
        settle({ owner, error })
      })

    /**
     * La page entière attend cette réponse (#192 retient la peinture jusqu'à ce que la sélection
     * soit connue). `apiFetch` ne pose aucun délai maximal, donc une requête qui ne retombe
     * jamais — une connexion qui pend, pas un rejet — laisserait un visiteur connecté sur des
     * squelettes indéfiniment, sur une page par ailleurs publique. Passé ce délai, on abandonne
     * les préférences et la page s'ouvre sans filtre : c'est exactement le repli que la Story
     * demande sur échec, appliqué à l'échec qui ne se déclare pas.
     */
    const timeout = setTimeout(() => {
      settle({ owner, error: new Error('preferences-timeout') })
    }, PREFERENCES_TIMEOUT_MS)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [authenticated, owner])

  const applySaved = useCallback(
    (preferences: EventPreferences) => {
      setSettled({ owner, preferences })
    },
    [owner],
  )

  const state = useMemo<EventPreferencesState>(() => {
    // Ce qui a été lu pour quelqu'un d'autre ne vaut pas pour celui-ci.
    const current = settled?.owner === owner ? settled : null

    // Une session encore en cours de restauration se lit comme un chargement, et non comme une
    // absence de session : c'est ce qui empêche la page de s'ouvrir sans filtre avant de se
    // rétracter une fois la session revenue.
    if (auth.status === 'loading') return { status: 'loading' }
    if (auth.status !== 'authenticated') return { status: 'anonymous' }
    if (current === null) return { status: 'loading' }
    if ('error' in current) return { status: 'error' }

    return { status: 'ready', preferences: current.preferences }
  }, [auth.status, owner, settled])

  // Mémoïsé, et pas par confort : `EventsPage` liste cet état parmi les dépendances de trois
  // `useMemo`. Un objet neuf à chaque rendu les rendait tous inopérants — dont celui qui
  // reconstruit la table des noms sur l'intégralité des options.
  return useMemo(() => ({ state, applySaved }), [state, applySaved])
}
