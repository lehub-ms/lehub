import { render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { routes } from '@/routes'

/**
 * Mounts the application's real route table at `path`.
 *
 * `routes` is imported, never restated: a route that exists in the app but not in the
 * tests would otherwise be untested and invisible.
 */
export function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return { ...render(<RouterProvider router={router} />), router }
}
