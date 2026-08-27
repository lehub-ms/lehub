import type { RouteObject } from 'react-router'
import { RootLayout } from '@/components/RootLayout'
import { PATHS } from '@/lib/navigation'
import { HomePage } from '@/pages/HomePage'
import { EventsPage } from '@/pages/EventsPage'
import { LeHubPage } from '@/pages/LeHubPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { SignUpPage } from '@/pages/SignUpPage'

/**
 * The route table, as data rather than JSX, so the tests can mount this exact object
 * with `createMemoryRouter` instead of restating it.
 *
 * `caseSensitive` is not decoration: React Router builds its matchers with
 * `new RegExp(source, caseSensitive ? undefined : 'i')`, so without it "/EVENEMENTS"
 * would resolve to the events page. Story #8 wants one canonical URL per section.
 */
export const routes: RouteObject[] = [
  {
    path: PATHS.home,
    Component: RootLayout,
    children: [
      { index: true, Component: HomePage },
      { path: PATHS.events, caseSensitive: true, Component: EventsPage },
      { path: PATHS.hub, caseSensitive: true, Component: LeHubPage },
      { path: PATHS.signUp, caseSensitive: true, Component: SignUpPage },
      { path: '*', Component: NotFoundPage },
    ],
  },
]
