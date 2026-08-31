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
     un lien vers un évènement est ainsi complet, et un rechargement retombe au bon endroit.

     Le segment porte le **slug** depuis #166, pas l'identifiant : une adresse partagée doit se
     lire et se recopier. Une adresse portant encore un identifiant continue de fonctionner et
     arrive sur la forme canonique — c'est `CommunityScope` qui s'en charge, avec le même
     mécanisme qui ramenait déjà la casse. */
  /** La route parente de la section : tout ce qui vit sous une communauté en dépend. */
  community: '/c/:communitySlug',
  communityEvents: '/c/:communitySlug/evenements',
  communityOrganizers: '/c/:communitySlug/organisateurs',

  /* Administration générale. Ces écrans ne portent pas de communauté — ils gèrent les
     référentiels partagés, qui n'appartiennent à aucune. */
  communities: '/communautes',
  technologies: '/technologies',
  administrators: '/administrateurs',
} as const

/** Les deux sections qui vivent sous une communauté, dans l'ordre de la barre latérale. */
export const COMMUNITY_SECTIONS = ['evenements', 'organisateurs'] as const

export type CommunitySection = (typeof COMMUNITY_SECTIONS)[number]

/**
 * Le chemin d'une section pour une communauté donnée. Écrit ici, jamais concaténé ailleurs.
 *
 * Prend le slug. Passer un identifiant produit une adresse qui *fonctionne* — `CommunityScope`
 * la résout puis la canonicalise — mais qui n'est pas celle qu'on veut partager.
 */
export function communityPath(communitySlug: string, section: CommunitySection): string {
  return `/c/${communitySlug}/${section}`
}

/**
 * Le segment de route du formulaire de création. Un mot et non un identifiant : l'adresse d'une
 * création ne désigne rien qui existe, et `nouveau` ne peut pas être confondu avec un GUID —
 * `EventFormPage` distingue les deux sur ce seul segment.
 */
export const NEW_EVENT_SEGMENT = 'nouveau'

/** Le formulaire d'un nouvel évènement de la communauté. */
export function newEventPath(communitySlug: string): string {
  return `${communityPath(communitySlug, 'evenements')}/${NEW_EVENT_SEGMENT}`
}

/**
 * Le formulaire d'un évènement existant.
 *
 * L'identifiant est dans l'adresse et non dans un état d'écran : « une adresse d'évènement se
 * partage, se met en favori et se recharge » (#143). Le slug reste celui de la communauté depuis
 * laquelle on y arrive — un évènement co-organisé s'atteint donc par deux adresses, et c'est
 * voulu : chacune ramène à la liste dont on est parti.
 */
export function eventPath(communitySlug: string, eventId: string): string {
  return `${communityPath(communitySlug, 'evenements')}/${eventId}`
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
