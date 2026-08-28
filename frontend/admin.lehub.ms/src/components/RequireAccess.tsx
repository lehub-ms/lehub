import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@shared/auth/useAuth'
import { hasBackofficeAccess } from '@/lib/access'
import { PATHS } from '@/lib/navigation'

/**
 * La seconde moitié de la garde : connecté, mais habilité ?
 *
 * Séparée de `RequireSession` parce que les deux refus n'ont rien à voir. L'un se répare en se
 * connectant ; l'autre jamais, et renvoyer au formulaire de connexion un compte parfaitement
 * authentifié le ferait tourner en boucle — exactement ce que la story #111 interdit.
 *
 * Est habilité quiconque est administrateur global ou organisateur d'au moins une communauté :
 * voir `hasBackofficeAccess`, qui reprend la définition du serveur, sur la réponse du serveur
 * (#110). Ce n'est pour autant pas la décision — l'API refuse à l'identique.
 */
export function RequireAccess(): ReactNode {
  const { state } = useAuth()

  if (state.status !== 'authenticated') return null
  if (!hasBackofficeAccess(state.permissions)) return <Navigate to={PATHS.noAccess} replace />

  return <Outlet />
}
