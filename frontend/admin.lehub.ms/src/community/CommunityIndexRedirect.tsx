import type { ReactNode } from 'react'
import { Navigate } from 'react-router'

/**
 * `/c/<communauté>` sans section n'affichait rien du tout : la route parente n'avait pas
 * d'index, et le joker `*` ne capture pas un reste vide — pas même l'écran introuvable que
 * `/c/<communauté>/nawak` rend correctement.
 *
 * Une adresse tronquée à la main, ou un lien plus ancien, tombait donc sur une zone de contenu
 * blanche. Elle mène désormais aux évènements, comme l'entrée du backoffice.
 */
export function CommunityIndexRedirect(): ReactNode {
  return <Navigate to="evenements" replace />
}
