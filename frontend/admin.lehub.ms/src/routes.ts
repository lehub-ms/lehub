import type { RouteObject } from 'react-router'
import { AdminLayout } from '@/components/AdminLayout'
import { AuthLayout } from '@/components/AuthLayout'
import { RequireAccess } from '@/components/RequireAccess'
import { RequireGlobalAdmin } from '@/components/RequireGlobalAdmin'
import { RequireNoAccess } from '@/components/RequireNoAccess'
import { RequireSession } from '@/components/RequireSession'
import { PATHS } from '@/lib/navigation'
import { HomePage } from '@/pages/HomePage'
import { NoAccessPage } from '@/pages/NoAccessPage'
import { CommunityScope } from '@/community/CommunityScope'
import { NotFoundPage } from '@/pages/NotFoundPage'
import {
  AdministratorsPage,
  CommunitiesPage,
  EventsPage,
  OrganizersPage,
  TechnologiesPage,
} from '@/pages/placeholders'
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
 * tourner en boucle. Il porte pour autant sa propre garde, `RequireNoAccess` : « au-dessus de
 * l'habilitation » ne veut pas dire « ouvert à tous », et une session habilitée qui atterrit
 * là doit en repartir.
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
        Component: RequireNoAccess,
        children: [
          {
            Component: AuthLayout,
            children: [{ path: PATHS.noAccess, caseSensitive: true, Component: NoAccessPage }],
          },
        ],
      },
      {
        Component: RequireAccess,
        children: [
          {
            path: PATHS.home,
            Component: AdminLayout,
            children: [
              { index: true, Component: HomePage },

              /* Section communauté : la communauté est un segment de route, donc un lien
                 vers un de ces écrans se partage tel quel.

                 Route parente plutôt que deux chemins absolus, pour que `communityId` reste
                 résolu sous n'importe quel enfant — le formulaire d'évènement de #143, et
                 jusqu'à l'écran introuvable d'une URL mal tapée. Sans elle, la coquille
                 perdrait sa section communauté au premier segment de trop. */
              {
                path: PATHS.community,
                caseSensitive: true,
                Component: CommunityScope,
                children: [
                  { path: 'evenements', caseSensitive: true, Component: EventsPage },
                  { path: 'organisateurs', caseSensitive: true, Component: OrganizersPage },
                  { path: '*', Component: NotFoundPage },
                ],
              },

              /* Administration générale : des référentiels partagés, qui n'appartiennent à
                 aucune communauté et dont les routes n'en portent donc pas.

                 La garde est une route parente et non une vérification dans chaque écran :
                 c'est ce qui garantit qu'un non-administrateur n'en monte aucun, et n'en
                 apprend donc rien. */
              {
                Component: RequireGlobalAdmin,
                children: [
                  { path: PATHS.communities, caseSensitive: true, Component: CommunitiesPage },
                  { path: PATHS.technologies, caseSensitive: true, Component: TechnologiesPage },
                  { path: PATHS.administrators, caseSensitive: true, Component: AdministratorsPage },
                ],
              },

              { path: '*', Component: NotFoundPage },
            ],
          },
        ],
      },
    ],
  },
]
