import type { SessionPermissions } from '@lehub/shared/auth/AuthContext'
import type { CommunitySummary, NamedRef } from '@lehub/shared/lib/api'
import type { AdminCommunity, AdminEvent, AdminTechnology, EventOptions } from '@/lib/api'

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
  // Une **seconde** archivée, et ce n'est pas de la décoration : avec une seule, « le tri
  // réordonne les deux groupes » (#173) est intestable — un groupe d'une ligne est trié quoi
  // qu'on fasse — et le compteur archivé ne peut jamais atteindre le pluriel.
  {
    id: 'B4B4B4B4-0000-0000-0000-000000000004',
    name: 'Windows Phone',
    logoPath: null,
    logoUrl: null,
    status: 'archived',
    eventCount: 0,
  },
]

const AZUG = COMMUNITIES[0] as CommunitySummary
const PPF = COMMUNITIES[1] as CommunitySummary

/** Un rattachement tel qu'un évènement le porte : nom, marque, et son statut au référentiel. */
function ref(community: CommunitySummary, archived = false) {
  return { id: community.id, name: community.name, logoUrl: null, archived }
}

/**
 * Ce que rend `GET /api/manage/events`, toutes communautés confondues — `eventsFor` en extrait
 * la part d'une communauté, comme le fait la route.
 *
 * Choisies pour couvrir ce que #144 demande et non pour être jolies : un évènement avec bannière
 * et un sans, un évènement **co-organisé** par les deux communautés (il ne doit apparaître qu'une
 * fois, et rien ne doit le distinguer), un évènement déjà passé, et un qui n'appartient qu'à
 * l'autre communauté — celui-là ne doit jamais paraître dans la liste de la première.
 *
 * Les identifiants sont en majuscules, comme SQL Server rend ses `UNIQUEIDENTIFIER`.
 */
export const ADMIN_EVENTS: AdminEvent[] = [
  {
    id: 'E1E1E1E1-0000-0000-0000-000000000001',
    title: 'Azure Deep Dive : réseau et sécurité',
    description: 'Hub-and-spoke, Firewall, Private Link et segmentation.',
    startDate: '2026-09-10T16:30:00.000Z',
    endDate: '2026-09-10T19:00:00.000Z',
    bannerImagePath: 'events/azure-deep-dive.webp',
    bannerImageUrl: 'https://media.example/media/events/azure-deep-dive.webp',
    formatTypeId: 'F2F2F2F2-0000-0000-0000-000000000002',
    format: 'Meetup',
    eventModeId: 'D1D1D1D1-0000-0000-0000-000000000001',
    mode: 'Présentiel',
    communities: [ref(AZUG)],
    technologies: [],
  },
  {
    // Co-organisé. Sans bannière, donc c'est lui qui exerce le repli de la vignette.
    id: 'E2E2E2E2-0000-0000-0000-000000000002',
    title: 'Soirée commune Azure × Power Platform',
    description: 'Trois démos, puis discussions autour d’un verre.',
    startDate: '2026-10-02T17:00:00.000Z',
    endDate: '2026-10-02T20:30:00.000Z',
    bannerImagePath: null,
    bannerImageUrl: null,
    formatTypeId: 'F1F1F1F1-0000-0000-0000-000000000001',
    format: 'Conférence',
    eventModeId: 'D3D3D3D3-0000-0000-0000-000000000003',
    mode: 'Hybride',
    communities: [ref(AZUG), ref(PPF)],
    technologies: [],
  },
  {
    // Déjà passé : #144 le liste comme les autres, #174 le repliera.
    id: 'E3E3E3E3-0000-0000-0000-000000000003',
    title: 'Rétrospective Build 2026',
    description: 'Les annonces qui comptent, commentées.',
    startDate: '2026-06-11T16:00:00.000Z',
    endDate: '2026-06-11T19:00:00.000Z',
    bannerImagePath: null,
    bannerImageUrl: null,
    formatTypeId: 'F2F2F2F2-0000-0000-0000-000000000002',
    format: 'Meetup',
    eventModeId: 'D2D2D2D2-0000-0000-0000-000000000002',
    mode: 'En ligne',
    communities: [ref(AZUG)],
    technologies: [],
  },
  {
    // N'appartient qu'à la seconde communauté.
    id: 'E4E4E4E4-0000-0000-0000-000000000004',
    title: 'Power Platform Apéro #12',
    description: 'Format court et convivial.',
    startDate: '2026-09-25T17:00:00.000Z',
    endDate: '2026-09-25T20:00:00.000Z',
    bannerImagePath: null,
    bannerImageUrl: null,
    formatTypeId: 'F2F2F2F2-0000-0000-0000-000000000002',
    format: 'Meetup',
    eventModeId: 'D1D1D1D1-0000-0000-0000-000000000001',
    mode: 'Présentiel',
    communities: [ref(PPF)],
    technologies: [],
  },
]

/**
 * Ce que rend `GET /api/technologies` : les technologies **actives** seulement.
 *
 * Volontairement disjointe d'`ADMIN_TECHNOLOGIES` sur un point : « Silverlight » y est archivée
 * et n'apparaît donc pas ici, alors qu'un évènement de la fixture la porte. C'est ce qui rend
 * éprouvable « une entrée archivée déjà rattachée reste visible et retirable, mais ne peut plus
 * être ajoutée » (#147).
 */
export const TECHNOLOGIES: NamedRef[] = [
  { id: 'B1B1B1B1-0000-0000-0000-000000000001', name: 'Azure', logoUrl: null },
  { id: 'B2B2B2B2-0000-0000-0000-000000000002', name: '.NET', logoUrl: null },
]

/**
 * Ce que rend `GET /api/event-options` : les deux vocabulaires fermés.
 *
 * Dans l'ordre alphabétique que la requête impose, « Autre » compris — la fixture reproduit ce
 * que la route rend, pas ce qu'on aimerait qu'elle rende.
 */
export const EVENT_OPTIONS: EventOptions = {
  formats: [
    { id: 'F5F5F5F5-0000-0000-0000-000000000005', name: 'Atelier' },
    { id: 'F6F6F6F6-0000-0000-0000-000000000006', name: 'Autre' },
    { id: 'F1F1F1F1-0000-0000-0000-000000000001', name: 'Conférence' },
    { id: 'F4F4F4F4-0000-0000-0000-000000000004', name: 'Hackathon' },
    { id: 'F2F2F2F2-0000-0000-0000-000000000002', name: 'Meetup' },
    { id: 'F3F3F3F3-0000-0000-0000-000000000003', name: 'Webinaire' },
  ],
  modes: [
    { id: 'D2D2D2D2-0000-0000-0000-000000000002', name: 'En ligne' },
    { id: 'D3D3D3D3-0000-0000-0000-000000000003', name: 'Hybride' },
    { id: 'D1D1D1D1-0000-0000-0000-000000000001', name: 'Présentiel' },
  ],
}

/**
 * Le filtre que la route applique, rejoué ici.
 *
 * La substitution de `fetch` s'en sert plutôt que de rendre la liste entière : « la liste ne
 * contient que les évènements rattachés à la communauté sélectionnée » est un critère de #144,
 * et un bouchon qui rendrait tout le laisserait passer même si l'écran oubliait la communauté.
 * Insensible à la casse, comme le serveur.
 */
export function eventsFor(communityId: string): AdminEvent[] {
  const wanted = communityId.toLowerCase()
  return ADMIN_EVENTS.filter((event) =>
    event.communities.some((community) => community.id.toLowerCase() === wanted),
  )
}

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
