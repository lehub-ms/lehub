import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderAt } from './support/render-route'

function headingText(): string {
  return screen.getByRole('heading', { level: 1 }).textContent ?? ''
}

describe('routes publiques', () => {
  it('sert l’accueil sur /', () => {
    renderAt('/')
    expect(headingText()).toContain('LeHub')
  })

  it('sert les évènements sur /evenements', () => {
    renderAt('/evenements')
    expect(headingText()).toContain('Évènements à venir')
  })

  it('sert Le Hub sur /lehub', () => {
    renderAt('/lehub')
    expect(headingText()).toContain('Les fonctionnalités LeHub')
  })

  it('n’expose qu’un seul titre de niveau 1 par page', () => {
    renderAt('/lehub')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})

describe('URL invalides', () => {
  it('rend la page 404 pour une URL inconnue', () => {
    renderAt('/foo')
    expect(headingText()).toBe('Page introuvable')
    expect(screen.getByText(/n’existe pas ou a été déplacée/)).not.toBeNull()
  })

  it('rend la page 404 pour une URL profonde inconnue', () => {
    renderAt('/evenements/42')
    expect(headingText()).toBe('Page introuvable')
  })

  it('rend la page 404 sur un slash final', () => {
    // React Router compiles patterns with a trailing `\/*$`, so "/evenements/" would
    // otherwise resolve to the events page. StrictPathOutlet is what forbids it.
    renderAt('/evenements/')
    expect(headingText()).toBe('Page introuvable')
  })

  it('rend la page 404 quand la casse diffère', () => {
    // Without `caseSensitive: true` React Router matches with the `i` flag.
    renderAt('/Evenements')
    expect(headingText()).toBe('Page introuvable')
  })

  it('garde la navigation et le pied de page sur la 404', () => {
    renderAt('/foo')
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).not.toBeNull()
    expect(screen.getByRole('contentinfo')).not.toBeNull()
  })

  it('ramène à l’accueil depuis la 404', async () => {
    const user = userEvent.setup()
    const { router } = renderAt('/foo')

    await user.click(screen.getByRole('link', { name: /Retour à l’accueil/ }))

    expect(router.state.location.pathname).toBe('/')
    expect(headingText()).toContain('LeHub')
  })
})

describe('coquille commune', () => {
  it.each(['/', '/evenements', '/lehub', '/foo'])(
    'expose les landmarks navigation, main et contentinfo sur %s',
    (path) => {
      renderAt(path)
      expect(screen.getByRole('navigation', { name: 'Navigation principale' })).not.toBeNull()
      expect(screen.getByRole('main')).not.toBeNull()
      expect(screen.getByRole('contentinfo')).not.toBeNull()
    },
  )

  it('place le lien d’évitement en tête et le pointe sur le contenu principal', () => {
    renderAt('/')
    const skip = screen.getByRole('link', { name: 'Aller au contenu principal' })
    expect(skip.getAttribute('href')).toBe('#contenu')
    expect(screen.getByRole('main').id).toBe('contenu')
  })
})
