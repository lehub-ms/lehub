/**
 * The three public URLs. Referenced by the route table, the header and the drawer, so
 * a path is spelled exactly once in the codebase.
 */
export const PATHS = {
  home: '/',
  events: '/evenements',
  hub: '/lehub',
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
