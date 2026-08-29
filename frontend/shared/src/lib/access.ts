import type { SessionPermissions } from '../auth/AuthContext'

/**
 * Qui entre dans le backoffice : un administrateur global, ou l'organisateur d'au moins une
 * communauté. Même définition que côté serveur, lue dans la même réponse (#110).
 *
 * Dans le socle partagé parce que les deux applications posent la question : le backoffice pour
 * décider qui entre, le site public pour décider s'il propose la porte (#137). Une seule
 * définition, donc, et pas deux qui divergeraient le jour où un troisième niveau apparaîtrait.
 *
 * Ce n'est jamais la décision de sécurité : le serveur refuse à l'identique.
 */
export function hasBackofficeAccess(permissions: SessionPermissions): boolean {
  return permissions.isGlobalAdmin || permissions.organizedCommunityIds.length > 0
}
