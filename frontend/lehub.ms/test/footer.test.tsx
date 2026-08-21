import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderAt } from './support/render-route'

const EXPECTED = [
  { pattern: /GitHub/, href: 'https://github.com/lehub-ms/lehub' },
  { pattern: /LinkedIn/, href: 'https://www.linkedin.com/in/tchinnin' },
]

describe('pied de page', () => {
  it.each(['/', '/evenements', '/lehub', '/foo'])('est présent sur %s', (path) => {
    renderAt(path)
    expect(screen.getByRole('contentinfo')).not.toBeNull()
  })

  it('affiche le logo LeHub', () => {
    renderAt('/')
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByText('Le')).not.toBeNull()
    expect(within(footer).getByText('Hub')).not.toBeNull()
  })

  it.each(EXPECTED)('ouvre $href dans un nouvel onglet', ({ pattern, href }) => {
    renderAt('/')
    const footer = screen.getByRole('contentinfo')

    const link = within(footer).getByRole('link', { name: pattern })

    expect(link.getAttribute('href')).toBe(href)
    expect(link.getAttribute('target')).toBe('_blank')
    // noreferrer alongside noopener: the tab must not inherit window.opener.
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('rel')).toContain('noreferrer')
  })

  it('donne un nom accessible à chaque lien, jamais une icône nue', () => {
    renderAt('/')
    const footer = screen.getByRole('contentinfo')

    const links = within(footer).getAllByRole('link')
    expect(links).toHaveLength(EXPECTED.length)

    for (const link of links) {
      // The SVG marks are aria-hidden, so an empty name here would mean the
      // aria-label went missing and the link became icon-only.
      const name = link.getAttribute('aria-label') ?? ''
      expect(name.length).toBeGreaterThan(0)
    }
  })
})
