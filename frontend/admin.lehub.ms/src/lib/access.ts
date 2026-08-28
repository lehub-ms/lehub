import type { SessionPermissions } from '@shared/auth/AuthContext'

/**
 * Qui entre dans le backoffice : un administrateur global, ou l'organisateur d'au moins une
 * communauté. Même définition que côté serveur, lue dans la même réponse (#110).
 *
 * Dans son propre fichier plutôt qu'à côté de la garde qui l'utilise : elle sera relue par les
 * écrans que la Feature #138 ajoute, et un module qui exporte à la fois un composant et une
 * fonction casse le rafraîchissement à chaud.
 */
export function hasBackofficeAccess(permissions: SessionPermissions): boolean {
  return permissions.isGlobalAdmin || permissions.organizedCommunityIds.length > 0
}
