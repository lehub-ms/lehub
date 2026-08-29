import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, openSession } from '../lib/api'
import { AuthContext, NO_PERMISSIONS, type AuthContextValue, type AuthState } from './AuthContext'
import { ensureFreshToken } from './authClient'
import {
  clearTokens,
  getRefreshToken,
  millisecondsBeforeRenewal,
  onRefreshTokenChangedElsewhere,
  onTokensCleared,
} from './tokenStore'

/** Plancher entre deux tentatives, pour qu'un renouvellement qui échoue ne tourne pas en rond. */
const RENEWAL_RETRY_MS = 15_000

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
   *
   * Le plancher sur le délai n'est pas cosmétique. `millisecondsBeforeRenewal` rend une valeur
   * nulle ou négative dès qu'on est entré dans la marge, et sans lui un renouvellement qui
   * échoue sans clore la session reprogrammerait un `setTimeout(…, 0)` — donc une boucle
   * serrée pendant toute la dernière minute du jeton.
   */
  const scheduleRenewal = useCallback(() => {
    cancelRenewal()
    const delay = millisecondsBeforeRenewal()
    if (delay === null) return

    renewalTimer.current = setTimeout(
      () => {
        void ensureFreshToken(true).then((token) => {
          if (token) rescheduleRef.current()
        })
      },
      Math.max(delay, RENEWAL_RETRY_MS),
    )
  }, [cancelRenewal])

  const completeSignIn = useCallback<AuthContextValue['completeSignIn']>(
    async (fallback) => {
      try {
        const { user, permissions } = await openSession(fallback)
        setState({ status: 'authenticated', user, permissions })
      } catch (error) {
        // `INCOMPLETE_IDENTITY` : la session existe bel et bien côté tenant, c'est la ligne
        // miroir qui n'a pas pu être écrite faute de nom exploitable. On reste connecté, sans
        // identité affichable, et #97 rend « Mon compte ». Refuser la session serait pire :
        // l'utilisateur a bien ses jetons et ne comprendrait pas d'être renvoyé au formulaire.
        //
        // Le code et non le statut : la route répond 409 à deux situations opposées, et
        // l'autre — `EMAIL_ALREADY_MIRRORED`, une adresse déjà miroitée sous un autre compte —
        // est une anomalie que le serveur journalise. L'absorber dans cette session dégradée
        // la rendrait invisible des deux côtés à la fois. Elle part donc dans la branche
        // d'erreur, où elle s'affiche.
        if (error instanceof ApiError && error.code === 'INCOMPLETE_IDENTITY') {
          // Sans ligne miroir, il n'y a pas d'habilitation à lire : la session est celle
          // d'un utilisateur ordinaire jusqu'à ce que le miroir puisse être écrit.
          setState({ status: 'authenticated', user: null, permissions: NO_PERMISSIONS })
        } else {
          // Une panne du serveur n'est pas un défaut d'identifiants. `/api/me/session` lit
          // désormais aussi les habilitations (#110), donc une base indisponible — celle de
          // dev s'endort au bout d'une heure — répond 500 sur une session parfaitement
          // valide. Effacer les jetons rendrait cette panne définitive : il faudrait
          // ressaisir un mot de passe pour quelques secondes d'indisponibilité.
          //
          // Ce que ce repli fait, et rien de plus : la session survit à la panne. L'état
          // retombe à anonyme et rien ne réessaie dans cette page — c'est le rechargement
          // suivant qui rétablit la session. Un réessai en séance relève de #96, qui porte le
          // maintien de la session.
          const serverFault = error instanceof ApiError && (error.status === 0 || error.status >= 500)
          if (!serverFault) clearTokens()
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
