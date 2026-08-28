import { createContext } from 'react'

/** Le miroir renvoyé par `POST /api/me/session` — la source unique du nom affiché. */
export interface AuthenticatedUser {
  objectId: string
  email: string
  givenName: string
  surname: string
  primaryAuthMethod: string
  lastAuthMethod: string
}

/**
 * Ce que la session a le droit de faire, tel que l'API le résout en base à chaque requête.
 *
 * C'est un confort d'interface et jamais une décision : le serveur refuse à l'identique
 * qu'un bouton ait été masqué ou non. Rien ici ne concerne un autre compte.
 */
export interface SessionPermissions {
  isGlobalAdmin: boolean
  /** Les communautés dont la session est organisatrice. Vide est le cas normal. */
  organizedCommunityIds: string[]
}

/** Les habilitations d'un utilisateur ordinaire — et de toute session pas encore résolue. */
export const NO_PERMISSIONS: SessionPermissions = { isGlobalAdmin: false, organizedCommunityIds: [] }

/**
 * Union discriminée plutôt qu'un booléen accompagné d'un objet éventuellement nul, sur le
 * patron de `useUpcomingEvents`. `loading` est un état à part entière : au premier rendu on
 * ne sait pas encore si un jeton de rafraîchissement va rendre une session, et afficher
 * « Me connecter » pendant ce temps ferait clignoter la navigation à chaque visite.
 */
export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: AuthenticatedUser; permissions: SessionPermissions }
  /**
   * Authentifié auprès du tenant, mais sans ligne miroir exploitable — claims incomplets et
   * rien pour les rattraper. La session est ouverte, l'identité affichable ne l'est pas ;
   * #97 rend « Mon compte » dans ce cas plutôt qu'une adresse email.
   */
  | { status: 'authenticated'; user: null; permissions: SessionPermissions }

export interface AuthContextValue {
  state: AuthState
  /**
   * À appeler quand un parcours vient d'obtenir des jetons. Les valeurs saisies au
   * formulaire servent de repli si le tenant n'a pas encore propagé le prénom et le nom.
   */
  completeSignIn: (fallback?: { givenName?: string; surname?: string }) => Promise<void>
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
