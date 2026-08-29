import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@shared/auth/useAuth'
import { hasBackofficeAccess } from '@shared/lib/access'
import { PATHS } from '@/lib/navigation'

/**
 * La garde symétrique de `RequireAccess`, et la raison qu'elle existe tient en une phrase :
 * l'écran d'absence d'accès affirme quelque chose sur le compte qui le lit.
 *
 * Sans elle, l'affirmation devient fausse dès qu'une session habilitée atteint `/acces-refuse`
 * — et elle l'atteint plus facilement qu'il n'y paraît. Ce chemin est sous `RequireSession`,
 * donc retenu comme destination au moment d'une déconnexion ; la connexion suivante, d'un autre
 * compte ou du même une fois désigné organisateur, y est renvoyée par `safeRedirect`. Un compte
 * parfaitement habilité lirait alors qu'il ne l'est pas, sans que rien dans l'application ne
 * l'en sorte.
 *
 * Une garde à sens unique n'est pas une garde : c'est la story #111 par l'autre bout.
 */
export function RequireNoAccess(): ReactNode {
  const { state } = useAuth()

  if (state.status !== 'authenticated') return null
  if (hasBackofficeAccess(state.permissions)) return <Navigate to={PATHS.home} replace />

  return <Outlet />
}
