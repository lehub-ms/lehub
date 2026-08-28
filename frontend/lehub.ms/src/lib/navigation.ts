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
