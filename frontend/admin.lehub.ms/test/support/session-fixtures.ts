import type { SessionPermissions } from '@lehub/shared/auth/AuthContext'
import type { CommunitySummary } from '@lehub/shared/lib/api'
import type { AdminCommunity, AdminTechnology } from '@/lib/api'

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
    slug: 'azure-user-group-france',
    name: 'Azure User Group France',
    logoUrl: null,
    description: null,
  },
  {
    id: 'C2C2C2C2-0000-0000-0000-000000000002',
    slug: 'power-platform-france',
    name: 'Power Platform France',
    logoUrl: null,
    description: null,
  },
]

/**
 * Ce que rendent les deux vues d'administration des référentiels.
 *
 * Volontairement moins lisses que `COMMUNITIES` : une entrée archivée, une sans organisateur, une
 * avec des évènements rattachés et une sans, un nom très long, un accent. Chacune correspond à un
 * critère ou à un edge case de #151 et #155 — une fixture propre ne teste que le cas facile.
 */
export const ADMIN_COMMUNITIES: AdminCommunity[] = [
  {
    id: 'C1C1C1C1-0000-0000-0000-000000000001',
    slug: 'azure-user-group-france',
    name: 'Azure User Group France',
    description: 'L’écosystème Azure au cœur de vos projets cloud.',
    logoPath: 'communities/azure-user-group-france.svg',
    logoUrl: 'https://media.example/media/communities/azure-user-group-france.svg',
    status: 'active',
    organizerCount: 2,
    eventCount: 3,
  },
  {
    id: 'C2C2C2C2-0000-0000-0000-000000000002',
    slug: 'power-platform-france',
    name: 'Power Platform France',
    description: 'Low-code au service de tous.',
    logoPath: null,
    logoUrl: null,
    status: 'active',
    // Aucun organisateur désigné : ce n'est pas une anomalie.
    organizerCount: 0,
    // Aucun évènement : la seule que la suppression définitive puisse concerner.
    eventCount: 0,
  },
  {
    id: 'C3C3C3C3-0000-0000-0000-000000000003',
    slug: 'communaute-generaliste-du-numerique-responsable-en',
    name: 'Communauté Généraliste du Numérique Responsable en Nouvelle-Aquitaine',
    description: null,
    logoPath: null,
    logoUrl: null,
    status: 'archived',
    organizerCount: 1,
    eventCount: 7,
  },
]

export const ADMIN_TECHNOLOGIES: AdminTechnology[] = [
  {
    id: 'B1B1B1B1-0000-0000-0000-000000000001',
    name: 'Azure',
    logoPath: 'technologies/azure.svg',
    logoUrl: 'https://media.example/media/technologies/azure.svg',
    status: 'active',
    eventCount: 4,
  },
  {
    id: 'B2B2B2B2-0000-0000-0000-000000000002',
    name: '.NET',
    logoPath: null,
    logoUrl: null,
    status: 'active',
    eventCount: 0,
  },
  {
    id: 'B3B3B3B3-0000-0000-0000-000000000003',
    name: 'Silverlight',
    logoPath: null,
    logoUrl: null,
    status: 'archived',
    eventCount: 2,
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
