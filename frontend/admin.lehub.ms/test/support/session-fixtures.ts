import type { SessionPermissions } from '@lehub/shared/auth/AuthContext'
import type { CommunitySummary } from '@lehub/shared/lib/api'

/** La réponse de `POST /api/me/session`, en un seul endroit — comme côté site public. */
export const MIRROR = {
  objectId: '3f1b0c8e-1111-2222-3333-444455556666',
  email: 'ada@example.test',
  givenName: 'Ada',
  surname: 'Lovelace',
  primaryAuthMethod: 'email',
  lastAuthMethod: 'email',
}

/**
 * Ce que rend `GET /api/communities`. La première porte l'identifiant qu'`ORGANIZER` organise,
 * pour que les deux profils voient des listes différentes de la même réponse.
 *
 * **Les identifiants sont en majuscules**, comme SQL Server rend ses `UNIQUEIDENTIFIER`. Des
 * fixtures en minuscules ont laissé passer un défaut que l'application avait bel et bien : une
 * fixture qui ne ressemble pas à la production ne teste pas la production.
 */
export const COMMUNITIES: CommunitySummary[] = [
  {
    id: 'C1C1C1C1-0000-0000-0000-000000000001',
    name: 'Azure User Group France',
    logoUrl: null,
    description: null,
  },
  {
    id: 'C2C2C2C2-0000-0000-0000-000000000002',
    name: 'Power Platform France',
    logoUrl: null,
    description: null,
  },
]

/** Les trois profils qui décident de l'accès au backoffice. */
export const ORDINARY_USER: SessionPermissions = { isGlobalAdmin: false, organizedCommunityIds: [] }
export const ORGANIZER: SessionPermissions = {
  isGlobalAdmin: false,
  organizedCommunityIds: ['c1c1c1c1-0000-0000-0000-000000000001'],
}
export const GLOBAL_ADMIN: SessionPermissions = { isGlobalAdmin: true, organizedCommunityIds: [] }

/** Les deux qualités à la fois : ni un cas d'école, ni un cas théorique — un fondateur promu. */
export const ADMIN_AND_ORGANIZER: SessionPermissions = {
  isGlobalAdmin: true,
  organizedCommunityIds: ['c1c1c1c1-0000-0000-0000-000000000001'],
}

export function openedSession(permissions: SessionPermissions) {
  return { user: MIRROR, permissions }
}
