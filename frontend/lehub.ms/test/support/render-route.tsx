import { render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { AuthProvider } from '@lehub/shared/auth/AuthProvider'
import { routes } from '@/routes'

/**
 * Mounts the application's real route table at `path`.
 *
 * `routes` is imported, never restated: a route that exists in the app but not in the
 * tests would otherwise be untested and invisible. `AuthProvider` wraps it for the same
 * reason — it wraps the router in `main.tsx`, and a helper that left it out would make
 * every authenticated screen untestable through the real routes.
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
