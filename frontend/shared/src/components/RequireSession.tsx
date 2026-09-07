import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth'

/**
 * La garde de session, posée sur la route qui porte les autres.
 *
 * C'est ce qui rend une route non protégée impossible par construction plutôt que par vigilance :
 * ajouter un écran, c'est l'ajouter sous cette garde, et il n'y a pas d'autre endroit où
 * l'ajouter.
 *
 * Elle ne décide rien sur le fond : l'API refuse à l'identique toute requête d'une session
 * absente ou non habilitée (#109). Elle évite seulement de faire découvrir ses limites à
 * l'utilisateur par un message d'erreur.
 *
 * Une fabrique et non un composant à props : React Router instancie une route de mise en page
 * sans rien lui passer, donc le chemin de connexion — le seul point où les deux applications
 * diffèrent — doit être fermé à la construction. Chaque application en dérive sa garde en une
 * ligne, et la logique ne vit qu'ici.
 */
export function createRequireSession(signInPath: string): () => ReactNode {
  return function RequireSession(): ReactNode {
    const { state } = useAuth()
    const location = useLocation()

    // Pendant la restauration on n'affiche rien plutôt que le mauvais des deux états : montrer
    // l'écran de connexion à quelqu'un qui a une session valide, le temps qu'elle se rétablisse,
    // le renverrait s'authentifier sans raison.
    if (state.status === 'loading') return null

    if (state.status === 'anonymous') {
      // La destination voyage dans l'état de navigation, pas dans l'URL : elle n'a pas à être
      // partageable, et elle repasse par `safeRedirect` avant d'être suivie.
      //
      // Le fragment en fait partie, et il n'est plus hypothétique : le récapitulatif des
      // préférences (#195) s'atteint par `/profil#mes-preferences`, et le perdre ici renverrait
      // en haut de la page après la connexion.
      return (
        <Navigate
          to={signInPath}
          state={{ from: `${location.pathname}${location.search}${location.hash}` }}
          replace
        />
      )
    }

    return <Outlet />
  }
}
