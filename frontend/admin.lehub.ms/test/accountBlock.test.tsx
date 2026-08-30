import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { accountInitials } from '@/lib/accountInitials'
import { PATHS } from '@/lib/navigation'
import { renderAt } from './support/render-route'
import { GLOBAL_ADMIN, ORGANIZER } from './support/session-fixtures'
import { stubSignedIn } from './support/stub-session'
import type { SessionPermissions } from '@lehub/shared/auth/AuthContext'

async function enter(permissions: SessionPermissions) {
  stubSignedIn(permissions)
  const rendered = renderAt('/')
  await screen.findByRole('navigation', { name: 'Navigation principale' })
  return rendered
}

async function openAccountMenu(): Promise<HTMLElement> {
  const trigger = await screen.findByRole('button', { name: /ouvrir le menu du compte/i })
  fireEvent.keyDown(trigger, { key: 'Enter' })
  return screen.findByRole('menu')
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('accountInitials', () => {
  it('assemble les deux initiales, et se contente de celle qui existe', () => {
    expect(accountInitials({ givenName: 'Ada', surname: 'Lovelace' })).toBe('AL')
    expect(accountInitials({ givenName: 'Ada', surname: '  ' })).toBe('A')
  })

  it("ne rend rien à inventer plutôt qu'une lettre fabriquée", () => {
    for (const user of [null, {}, { givenName: '', surname: '' }]) {
      expect(accountInitials(user), JSON.stringify(user)).toBeNull()
    }
  })
})

describe('bloc du compte connecté', () => {
  it('annonce la qualité la plus large pour un administrateur', async () => {
    await enter(GLOBAL_ADMIN)
    const trigger = await screen.findByRole('button', { name: /ouvrir le menu du compte/i })

    expect(trigger.textContent).toContain('Ada Lovelace')
    expect(trigger.textContent).toContain('Administrateur')
    expect(trigger.getAttribute('aria-label')).toContain('Administrateur')
  })

  it('annonce « Organisateur » à un organisateur', async () => {
    await enter(ORGANIZER)
    const trigger = await screen.findByRole('button', { name: /ouvrir le menu du compte/i })

    expect(trigger.textContent).toContain('Organisateur')
    expect(trigger.textContent).not.toContain('Administrateur')
  })

  it("ne rend jamais d'arobase dans la barre latérale", async () => {
    await enter(GLOBAL_ADMIN)
    await screen.findByRole('button', { name: /ouvrir le menu du compte/i })

    // L'assertion porte sur la barre entière, pas sur le seul déclencheur : c'est la classe
    // de bugs qu'on ferme, pas un de ses cas. La session de test porte pourtant une adresse.
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' })
    const sidebar = nav.parentElement ?? nav
    expect(sidebar.textContent).not.toContain('@')
    expect(sidebar.textContent).not.toContain('ada')
  })

  it('porte les deux entrées, dont le retour vers le site public en nouvel onglet', async () => {
    await enter(GLOBAL_ADMIN)
    const menu = await openAccountMenu()

    const external = within(menu).getByRole('menuitem', { name: /aller sur lehub\.ms/i })
    expect(external.getAttribute('href')).toBe('http://localhost:5173')
    expect(external.getAttribute('target')).toBe('_blank')
    expect(external.getAttribute('rel')).toBe('noopener noreferrer')
    // Signalé comme externe pour les technologies d'assistance, pas seulement par une icône.
    expect(external.textContent).toContain('nouvel onglet')

    expect(within(menu).getByRole('menuitem', { name: /se déconnecter/i })).toBeTruthy()
  })

  it('met fin à la session et ramène à la connexion du backoffice', async () => {
    const { router } = await enter(GLOBAL_ADMIN)
    const menu = await openAccountMenu()

    fireEvent.click(within(menu).getByRole('menuitem', { name: /se déconnecter/i }))

    await waitFor(() => expect(router.state.location.pathname).toBe(PATHS.signIn))
    expect(window.localStorage.getItem('lehub.auth.refreshToken')).toBeNull()
    // Le backoffice n'a pas de parcours d'inscription : la connexion n'en propose aucun.
    expect(screen.queryByRole('link', { name: /créer un compte/i })).toBeNull()
  })

  it('reste utilisable barre réduite, sans perdre le nom ni la qualité', async () => {
    await enter(GLOBAL_ADMIN)
    fireEvent.click(screen.getByRole('button', { name: 'Réduire le menu' }))

    const trigger = await screen.findByRole('button', { name: /ouvrir le menu du compte/i })
    // Le nom quitte le rendu visible mais reste dans le nom accessible.
    expect(trigger.textContent).not.toContain('Ada Lovelace')
    expect(trigger.getAttribute('aria-label')).toContain('Ada Lovelace')
    expect(trigger.getAttribute('aria-label')).toContain('Administrateur')
  })
})
