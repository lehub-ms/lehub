import { useContext } from 'react'
import { AuthContext, type AuthContextValue } from './AuthContext'

/**
 * Lève plutôt que de rendre un état anonyme par défaut : un composant monté hors du
 * fournisseur afficherait « Me connecter » à un utilisateur connecté, ce qui se remarque
 * beaucoup moins qu'une erreur.
 */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth doit être utilisé dans un <AuthProvider>')
  return value
}
