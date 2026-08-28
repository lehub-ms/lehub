import type { RouteObject } from 'react-router'
import { AdminLayout } from '@/components/AdminLayout'
import { AuthLayout } from '@/components/AuthLayout'
import { RequireAccess } from '@/components/RequireAccess'
import { RequireSession } from '@/components/RequireSession'
import { PATHS } from '@/lib/navigation'
import { HomePage } from '@/pages/HomePage'
import { NoAccessPage } from '@/pages/NoAccessPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { SignInPage } from '@/pages/SignInPage'

/**
 * La table de routes, en données plutôt qu'en JSX, pour que les tests montent cet objet exact
 * avec `createMemoryRouter` au lieu de le redire.
 *
 * Sa forme est la garde elle-même. Deux routes vivent hors session — la connexion et la
 * réinitialisation — et **tout le reste** est enfant de `RequireSession` : ajouter un écran,
 * c'est l'ajouter là, et il n'y a pas d'autre endroit où l'ajouter. C'est ce que veut dire
 * « une route non protégée est impossible par construction, pas par vigilance ».
 *
 * L'écran d'absence d'accès est sous la session mais au-dessus de l'habilitation : il
 * s'adresse à quelqu'un de parfaitement authentifié, et le renvoyer à la connexion le ferait
 * tourner en boucle.
 *
 * `caseSensitive` n'est pas décoratif : React Router compile chaque motif avec
 * `new RegExp(source, caseSensitive ? undefined : 'i')`, donc sans lui « /CONNEXION »
 * résoudrait vers la page de connexion.
 */
export const routes: RouteObject[] = [
  {
    Component: AuthLayout,
    children: [
      { path: PATHS.signIn, caseSensitive: true, Component: SignInPage },
      { path: PATHS.resetPassword, caseSensitive: true, Component: ResetPasswordPage },
    ],
  },
  {
    Component: RequireSession,
    children: [
      {
        Component: AuthLayout,
        children: [{ path: PATHS.noAccess, caseSensitive: true, Component: NoAccessPage }],
      },
      {
        Component: RequireAccess,
        children: [
          {
            path: PATHS.home,
            Component: AdminLayout,
            children: [
              { index: true, Component: HomePage },
              { path: '*', Component: NotFoundPage },
            ],
          },
        ],
      },
    ],
  },
]
