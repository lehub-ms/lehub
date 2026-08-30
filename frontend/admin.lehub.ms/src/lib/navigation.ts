/**
 * Toutes les URL du backoffice, en un seul endroit.
 *
 * Deux d'entre elles seulement sont atteignables sans session — la connexion et la
 * réinitialisation. `routes.ts` s'appuie sur cette distinction pour placer la garde une fois
 * pour toutes, plutôt que route par route.
 */
export const PATHS = {
  home: '/',
  signIn: '/connexion',
  resetPassword: '/mot-de-passe-oublie',
  noAccess: '/acces-refuse',

  /* Section communauté. La communauté choisie est un segment de route et non un état caché :
     un lien vers un évènement est ainsi complet, et un rechargement retombe au bon endroit. */
  /** La route parente de la section : tout ce qui vit sous une communauté en dépend. */
  community: '/c/:communityId',
  communityEvents: '/c/:communityId/evenements',
  communityOrganizers: '/c/:communityId/organisateurs',

  /* Administration générale. Ces écrans ne portent pas de communauté — ils gèrent les
     référentiels partagés, qui n'appartiennent à aucune. */
  communities: '/communautes',
  technologies: '/technologies',
  administrators: '/administrateurs',
} as const

/** Les deux sections qui vivent sous une communauté, dans l'ordre de la barre latérale. */
export const COMMUNITY_SECTIONS = ['evenements', 'organisateurs'] as const

export type CommunitySection = (typeof COMMUNITY_SECTIONS)[number]

/** Le chemin d'une section pour une communauté donnée. Écrit ici, jamais concaténé ailleurs. */
export function communityPath(communityId: string, section: CommunitySection): string {
  return `/c/${communityId}/${section}`
}

/**
 * L'entrée de navigation correspondant à l'écran courant, routes enfants comprises : le
 * formulaire d'un évènement laisse « Évènements » actif.
 *
 * La barre oblique finale n'est pas décorative — sans elle, `/evenements-archives` serait
 * considéré comme un enfant de `/evenements`.
 */
export function isSectionActive(pathname: string, sectionPath: string): boolean {
  return pathname === sectionPath || pathname.startsWith(`${sectionPath}/`)
}

/**
 * L'adresse du site public, d'où l'on vient et où l'on repart : un compte s'y crée, et c'est
 * là qu'on renvoie un compte sans habilitation. Jamais écrite en dur — elle diffère à chaque
 * environnement.
 */
export const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL

if (!PUBLIC_SITE_URL) {
  // Bruyamment au démarrage, comme pour l'origine de l'API : un lien vers « undefined » sur
  // l'écran d'absence d'accès enverrait dans le mur celui qui a le plus besoin d'aide.
  throw new Error(
    'VITE_PUBLIC_SITE_URL is not set. Copy .env.example to .env.local, or check the workflow that builds this app.',
  )
}
