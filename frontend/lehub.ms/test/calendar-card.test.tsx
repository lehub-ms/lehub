import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { CalendarCard } from '@/components/CalendarCard'
import { PATHS } from '@/lib/navigation'

/** La carte contient désormais un `Link`, qui exige un routeur autour d'elle. */
function renderCard() {
  const router = createMemoryRouter([{ path: '/', element: <CalendarCard /> }], {
    initialEntries: ['/'],
  })
  return render(<RouterProvider router={router} />)
}

describe('encart calendrier personnalisé', () => {
  it('affiche le titre et la description courte', () => {
    renderCard()
    expect(screen.getByRole('heading', { name: /votre calendrier personnalisé/i })).not.toBeNull()
    expect(screen.getByText(/s’ajoutent automatiquement/)).not.toBeNull()
  })

  it("explique le principe de l'URL de calendrier unique", () => {
    renderCard()
    expect(screen.getByText(/URL de calendrier unique/)).not.toBeNull()
  })

  it('affiche les trois applications compatibles', () => {
    renderCard()
    for (const app of ['Apple Calendar', 'Outlook', 'Google Calendar']) {
      expect(screen.getByText(app)).not.toBeNull()
    }
  })

  it("mène désormais à l'inscription, au lieu de rester inerte", () => {
    renderCard()
    const link = screen.getByRole('link', { name: /créer un compte/i })
    expect(link.getAttribute('href')).toBe(PATHS.signUp)
    // La mention « bientôt disponible » n'a plus lieu d'être : le parcours existe.
    expect(screen.queryByText(/bientôt disponible/i)).toBeNull()
  })

  it('respecte le plancher tactile', () => {
    renderCard()
    expect(screen.getByRole('link', { name: /créer un compte/i }).className).toContain('min-h-11')
  })
})
