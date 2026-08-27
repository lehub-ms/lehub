import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { accountLabel, NEUTRAL_ACCOUNT_LABEL } from '@/lib/accountLabel'
import { PATHS } from '@/lib/navigation'
import { renderAt } from './support/render-route'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const MIRROR = {
  objectId: '3f1b0c8e-1111-2222-3333-444455556666',
  email: 'ada.lovelace@example.test',
  givenName: 'Ada',
  surname: 'Lovelace',
  primaryAuthMethod: 'email',
  lastAuthMethod: 'email',
}

/** Rend l'application avec une session déjà ouverte, restaurée depuis le stockage. */
function stubSignedIn(mirror: unknown = MIRROR, status = 200) {
  window.localStorage.setItem('lehub.auth.refreshToken', 'rt')
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/api/auth/token')
          ? jsonResponse({ access_token: 'at', refresh_token: 'rt2', expires_in: 3600 })
          : jsonResponse(mirror, status),
      ),
    ),
  )
}

const user = userEvent.setup({ pointerEventsCheck: 0 })

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('accountLabel', () => {
  it('assemble le prénom et le nom', () => {
    expect(accountLabel({ givenName: 'Ada', surname: 'Lovelace' })).toBe('Ada Lovelace')
  })

  it("n'ajoute pas d'espace isolé quand un des deux manque", () => {
    expect(accountLabel({ givenName: 'Ada', surname: '' })).toBe('Ada')
    expect(accountLabel({ givenName: '  ', surname: 'Lovelace' })).toBe('Lovelace')
  })

  it("retombe sur l'intitulé neutre quand il n'y a rien à afficher", () => {
    for (const user of [null, {}, { givenName: '', surname: '' }, { givenName: '   ' }]) {
      expect(accountLabel(user), JSON.stringify(user)).toBe(NEUTRAL_ACCOUNT_LABEL)
    }
  })
})

describe('menu compte de la navigation', () => {
  it('affiche « Me connecter » hors session', () => {
    vi.stubGlobal('fetch', vi.fn())
    renderAt(PATHS.home)
    expect(screen.getByRole('link', { name: 'Me connecter' }).getAttribute('href')).toBe(PATHS.signIn)
  })

  it("affiche le prénom et le nom en session, et donne accès au profil et à la déconnexion", async () => {
    stubSignedIn()
    renderAt(PATHS.home)

    const trigger = await screen.findByRole('button', { name: /ada lovelace/i })
    await user.click(trigger)

    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /mon profil/i })).not.toBeNull()
    expect(within(menu).getByRole('menuitem', { name: /se déconnecter/i })).not.toBeNull()
  })

  it("ne rend jamais d'arobase dans la navigation d'un utilisateur connecté", async () => {
    stubSignedIn()
    renderAt(PATHS.home)
    await screen.findByRole('button', { name: /ada lovelace/i })

    const nav = screen.getByRole('navigation', { name: 'Navigation principale' })
    // L'assertion porte sur le rendu entier, pas sur le seul déclencheur : c'est la classe
    // de bugs qu'on ferme, pas un de ses cas.
    expect(nav.textContent).not.toContain('@')
    expect(nav.textContent).not.toContain('ada.lovelace')
  })

  it("affiche l'intitulé neutre quand le miroir n'a pas pu être écrit, sans perdre le menu", async () => {
    stubSignedIn({ code: 'INCOMPLETE_IDENTITY' }, 409)
    renderAt(PATHS.home)

    const trigger = await screen.findByRole('button', { name: NEUTRAL_ACCOUNT_LABEL })
    await user.click(trigger)

    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /se déconnecter/i })).not.toBeNull()
  })

  it("s'ouvre et se parcourt au clavier", async () => {
    stubSignedIn()
    renderAt(PATHS.home)

    const trigger = await screen.findByRole('button', { name: /ada lovelace/i })
    trigger.focus()
    await user.keyboard('{Enter}')

    const menu = await screen.findByRole('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    // Le premier élément est désactivé : le clavier atterrit donc sur le suivant.
    await waitFor(() =>
      expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: /se déconnecter/i })),
    )
  })

  it('ramène à « Me connecter » à la déconnexion', async () => {
    stubSignedIn()
    renderAt(PATHS.home)

    await user.click(await screen.findByRole('button', { name: /ada lovelace/i }))
    await user.click(await screen.findByRole('menuitem', { name: /se déconnecter/i }))

    await waitFor(() => expect(screen.getByRole('link', { name: 'Me connecter' })).not.toBeNull())
    expect(window.localStorage.getItem('lehub.auth.refreshToken')).toBeNull()
  })

  it('respecte le plancher tactile et ne déborde pas sur un nom très long', async () => {
    stubSignedIn({ ...MIRROR, surname: 'Lovelace-Byron-de-Montmorency-Saint-Exupéry' })
    renderAt(PATHS.home)

    const trigger = await screen.findByRole('button', { name: /ada lovelace-byron/i })
    expect(trigger.className).toContain('min-h-11')
    // `truncate` + `max-w` : le nom rétrécit au lieu de pousser la pilule hors de l'écran.
    expect(trigger.className).toContain('max-w-')
    expect(within(trigger).getByText(/lovelace-byron/i).className).toContain('truncate')
  })

  it('est présent à l’identique dans le repli mobile', async () => {
    stubSignedIn()
    renderAt(PATHS.home)
    await screen.findByRole('button', { name: /ada lovelace/i })

    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /ada lovelace/i })).not.toBeNull()
    expect(dialog.textContent).not.toContain('@')
  })
})
