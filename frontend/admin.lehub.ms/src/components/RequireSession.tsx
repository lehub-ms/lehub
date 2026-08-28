import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '@shared/auth/useAuth'
import { PATHS } from '@/lib/navigation'

/**
 * La garde du backoffice, posée une fois sur la route qui porte toutes les autres.
 *
 * C'est ce qui rend une route non protégée impossible par construction plutôt que par
 * vigilance : ajouter un écran, c'est l'ajouter sous cette garde, et il n'y a pas d'autre
 * endroit où l'ajouter. Seules la connexion et la réinitialisation vivent en dehors.
 *
 * Elle ne décide rien sur le fond : l'API refuse à l'identique toute requête d'une session
 * absente ou non habilitée (#109). Ce composant évite seulement de faire découvrir ses
 * limites à l'utilisateur par un message d'erreur.
 */
export function RequireSession(): ReactNode {
  const { state } = useAuth()
  const location = useLocation()

  // Pendant la restauration on n'affiche rien plutôt que le mauvais des deux états : montrer
  // l'écran de connexion à quelqu'un qui a une session valide, le temps qu'elle se rétablisse,
  // le renverrait s'authentifier sans raison.
  if (state.status === 'loading') return null

  if (state.status === 'anonymous') {
    // La destination voyage dans l'état de navigation, pas dans l'URL : elle n'a pas à être
    // partageable, et elle repasse par `safeRedirect` avant d'être suivie.
    return (
      <Navigate
        to={PATHS.signIn}
        state={{ from: `${location.pathname}${location.search}` }}
        replace
      />
    )
  }

  return <Outlet />
}
