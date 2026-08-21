import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalendarCard } from '@/components/CalendarCard'

describe('encart calendrier personnalisé', () => {
  it('affiche le titre et la description courte', () => {
    render(<CalendarCard />)
    expect(screen.getByRole('heading', { name: /votre calendrier personnalisé/i })).not.toBeNull()
    expect(screen.getByText(/s’ajoutent automatiquement/)).not.toBeNull()
  })

  it("explique le principe de l'URL de calendrier unique", () => {
    render(<CalendarCard />)
    expect(screen.getByText(/URL de calendrier unique/)).not.toBeNull()
  })

  it('affiche les trois applications compatibles', () => {
    render(<CalendarCard />)
    for (const app of ['Apple Calendar', 'Outlook', 'Google Calendar']) {
      expect(screen.getByText(app)).not.toBeNull()
    }
  })

  it('le bouton reste focusable, non fonctionnel, avec un nom accessible', async () => {
    const user = userEvent.setup()
    render(<CalendarCard />)

    const button = screen.getByRole('button', { name: /créer un compte.*bientôt disponible/i })
    expect(button.hasAttribute('disabled')).toBe(false)
    expect(button.getAttribute('aria-disabled')).toBe('true')

    button.focus()
    expect(document.activeElement).toBe(button)

    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(button)
  })

  it('un clic ou un Entrée ne provoque aucune navigation ni effet de bord', async () => {
    const user = userEvent.setup()
    render(<CalendarCard />)
    const button = screen.getByRole('button', { name: /créer un compte.*bientôt disponible/i })
    const initialUrl = window.location.href

    await user.click(button)
    expect(window.location.href).toBe(initialUrl)

    button.focus()
    await user.keyboard('{Enter}')
    expect(window.location.href).toBe(initialUrl)
  })
})
