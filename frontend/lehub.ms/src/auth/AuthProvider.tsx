import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, openSession } from '../lib/api'
import { AuthContext, type AuthContextValue, type AuthState } from './AuthContext'
import { ensureFreshToken } from './authClient'
import {
  clearTokens,
  getRefreshToken,
  millisecondsBeforeRenewal,
  onRefreshTokenChangedElsewhere,
  onTokensCleared,
} from './tokenStore'

/**
 * Porte la session : la restaure au chargement, la renouvelle avant qu'elle n'expire, et la
 * ferme proprement — dans cet onglet comme dans les autres.
 *
 * Premier contexte React du dépôt. Tout le reste est de l'état local, et le reste ainsi :
 * seule l'identité est réellement partagée entre la navigation, les écrans d'authentification
 * et, plus tard, les pages de profil.
 */
export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  // Calculé au premier rendu plutôt que corrigé par un effet : sans jeton de rafraîchissement
  // il n'y a rien à restaurer, et passer par `loading` ferait clignoter la navigation à chaque
  // visite d'un visiteur anonyme — c'est-à-dire presque toutes.
  const [state, setState] = useState<AuthState>(() =>
    getRefreshToken() ? { status: 'loading' } : { status: 'anonymous' },
  )

  // `useRef` plutôt que l'état : reprogrammer le minuteur ne doit pas provoquer de rendu.
  const renewalTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Le minuteur se reprogramme lui-même ; passer par une référence évite qu'une fonction
  // capturée dans un `setTimeout` continue d'appeler une version périmée d'elle-même.
  const rescheduleRef = useRef<() => void>(() => {})
  // Le montage double de StrictMode en développement rejouerait la restauration ; ce garde-fou
  // évite deux appels concurrents sur le même jeton de rafraîchissement.
  const restored = useRef(false)

  const cancelRenewal = useCallback(() => {
    if (renewalTimer.current !== null) {
      clearTimeout(renewalTimer.current)
      renewalTimer.current = null
    }
  }, [])

  /**
   * Programme le prochain renouvellement, avant l'expiration et non après l'échec d'une
   * requête. Se reprogramme lui-même tant que la session tient ; `clearTokens` interrompt la
   * chaîne par l'abonnement plus bas.
   */
  const scheduleRenewal = useCallback(() => {
    cancelRenewal()
    const delay = millisecondsBeforeRenewal()
    if (delay === null) return

    renewalTimer.current = setTimeout(
      () => {
        void ensureFreshToken().then((token) => {
          if (token) rescheduleRef.current()
        })
      },
      Math.max(delay, 0),
    )
  }, [cancelRenewal])

  const completeSignIn = useCallback<AuthContextValue['completeSignIn']>(
    async (fallback) => {
      try {
        const user = await openSession(fallback)
        setState({ status: 'authenticated', user })
      } catch (error) {
        // 409 : la session existe bel et bien côté tenant, c'est la ligne miroir qui n'a pas
        // pu être écrite faute de nom exploitable. On reste connecté, sans identité affichable,
        // et #97 rend « Mon compte ». Refuser la session serait pire : l'utilisateur a bien
        // ses jetons et ne comprendrait pas d'être renvoyé au formulaire.
        if (error instanceof ApiError && error.status === 409) {
          setState({ status: 'authenticated', user: null })
        } else {
          clearTokens()
          setState({ status: 'anonymous' })
          throw error
        }
      }
      scheduleRenewal()
    },
    [scheduleRenewal],
  )

  const signOut = useCallback(() => {
    // `clearTokens` prévient l'abonnement plus bas, qui bascule l'état et arrête le minuteur —
    // le même chemin que pour une session perdue, plutôt qu'un second mécanisme parallèle.
    clearTokens()
  }, [])

  useEffect(() => {
    rescheduleRef.current = scheduleRenewal
  }, [scheduleRenewal])

  // Une session perdue, quelle qu'en soit la cause, ramène à l'état déconnecté.
  useEffect(
    () =>
      onTokensCleared(() => {
        cancelRenewal()
        setState({ status: 'anonymous' })
      }),
    [cancelRenewal],
  )

  // Un autre onglet s'est déconnecté : celui-ci ne doit pas rester connecté pour la forme.
  useEffect(
    () =>
      onRefreshTokenChangedElsewhere((token) => {
        if (token === null) {
          cancelRenewal()
          setState({ status: 'anonymous' })
        }
      }),
    [cancelRenewal],
  )

  // Restauration au chargement. Aucun jeton de rafraîchissement : anonyme immédiatement,
  // sans requête et sans message d'erreur — une longue absence n'est pas une panne.
  useEffect(() => {
    if (restored.current) return
    restored.current = true

    if (!getRefreshToken()) return

    void ensureFreshToken().then(async (token) => {
      if (!token) {
        setState({ status: 'anonymous' })
        return
      }
      try {
        await completeSignIn()
      } catch {
        setState({ status: 'anonymous' })
      }
    })
  }, [completeSignIn])

  useEffect(() => cancelRenewal, [cancelRenewal])

  const value = useMemo<AuthContextValue>(
    () => ({ state, completeSignIn, signOut }),
    [state, completeSignIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
