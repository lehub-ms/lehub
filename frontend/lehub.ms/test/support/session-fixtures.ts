import type { SessionPermissions } from '@/auth/AuthContext'

/**
 * La réponse de `POST /api/me/session`, en un seul endroit.
 *
 * Quatre suites ouvrent une session pour arriver à ce qu'elles testent vraiment. Quand le
 * contrat de la route a gagné les habilitations (#110), les quatre se sont mises à rendre un
 * miroir sans utilisateur — un échec par assertion d'affichage, jamais par le contrat. Une
 * forme unique, ici, fait que le prochain changement de contrat casse à un seul endroit.
 */
export const MIRROR = {
  objectId: '3f1b0c8e-1111-2222-3333-444455556666',
  email: 'ada@example.test',
  givenName: 'Ada',
  surname: 'Lovelace',
  primaryAuthMethod: 'email',
  lastAuthMethod: 'email',
}

/** Un utilisateur ordinaire : ni administrateur, ni organisateur. Le cas de loin le plus courant. */
export const NO_PERMISSIONS: SessionPermissions = { isGlobalAdmin: false, organizedCommunityIds: [] }

export function openedSession(
  overrides: { user?: Partial<typeof MIRROR>; permissions?: Partial<SessionPermissions> } = {},
): { user: typeof MIRROR; permissions: SessionPermissions } {
  return {
    user: { ...MIRROR, ...overrides.user },
    permissions: { ...NO_PERMISSIONS, ...overrides.permissions },
  }
}
