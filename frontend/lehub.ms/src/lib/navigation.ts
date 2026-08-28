/**
 * Every URL of the public app. Referenced by the route table, the header, the drawer and
 * the tests, so a path is spelled exactly once in the codebase.
 *
 * The three authentication paths are not in NAV_ITEMS: they are reached from the account
 * entry point and from each other, never from the section list.
 */
export const PATHS = {
  home: '/',
  events: '/evenements',
  hub: '/lehub',
  signUp: '/inscription',
  signIn: '/connexion',
  resetPassword: '/mot-de-passe-oublie',
} as const

/**
 * L'adresse du backoffice, proposée depuis le menu compte aux seuls comptes habilités (#137).
 * Jamais écrite en dur : elle diffère à chaque environnement.
 */
export const ADMIN_BASE_URL = import.meta.env.VITE_ADMIN_BASE_URL

if (!ADMIN_BASE_URL) {
  // Bruyamment au démarrage, comme pour l'origine de l'API : une entrée de menu vers
  // « undefined » n'apparaîtrait qu'aux comptes habilités, donc à peu près jamais en revue.
  throw new Error(
    'VITE_ADMIN_BASE_URL is not set. Copy .env.example to .env.local, or check the workflow that builds this app.',
  )
}

export interface NavItem {
  readonly to: string
  readonly label: string
}

/**
 * The three public sections, in header order.
 *
 * Single source of truth: the desktop header, the mobile drawer and the tests all read
 * this list, so a section can never appear in one and be missing from another.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: PATHS.home, label: 'Accueil' },
  { to: PATHS.events, label: 'Évènements' },
  { to: PATHS.hub, label: 'Le Hub' },
]
