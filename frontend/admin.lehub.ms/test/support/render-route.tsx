import { render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { AuthProvider } from '@shared/auth/AuthProvider'
import { routes } from '@/routes'

/**
 * Monte la vraie table de routes du backoffice à `path`.
 *
 * `routes` est importée, jamais redite : une route qui existerait dans l'application sans
 * exister dans les tests serait non testée *et* invisible. `AuthProvider` l'enveloppe pour la
 * même raison — il enveloppe le routeur dans `main.tsx`, et une aide qui l'omettrait rendrait
 * la garde intestable à travers les vraies routes.
 */
export function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return {
    ...render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    ),
    router,
  }
}
