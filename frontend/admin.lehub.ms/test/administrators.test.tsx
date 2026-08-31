import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionPermissions } from '@lehub/shared/auth/AuthContext'
import { PATHS } from '@/lib/navigation'
import type { Account } from '@/lib/api'
import { renderAt } from './support/render-route'
import { GLOBAL_ADMIN, MIRROR, ORGANIZER } from './support/session-fixtures'
import { jsonResponse, stubSignedIn, type FetchOverrides } from './support/stub-session'

const AMELIE: Account = {
  givenName: 'Amélie',
  surname: 'Rousseau',
  email: 'amelie.rousseau@lehub.invalid',
}
const JULIEN: Account = { givenName: 'Julien', surname: 'Marchand', email: 'julien@lehub.invalid' }
/** La session elle-même : `MIRROR` est ce que rend `POST /api/me/session`. */
const SELF: Account = {
  givenName: MIRROR.givenName,
  surname: MIRROR.surname,
  email: MIRROR.email,
}

const ADMINS = '/api/manage/administrators'
const SEARCH = '/api/manage/accounts/search'

function withAdmins(people: Account[], extra: FetchOverrides = {}): FetchOverrides {
  return { [ADMINS]: () => jsonResponse(people), ...extra }
}

/** Voir #169 : on attend la donnée chargée, pas le repère de navigation. */
async function enter(
  permissions: SessionPermissions,
  overrides: FetchOverrides = {},
): Promise<void> {
  stubSignedIn(permissions, overrides)
  renderAt(PATHS.administrators)
  await screen.findByRole('heading', { level: 1 })
}

/** Le `<strong>` plutôt que le texte de la cellule : le disque d'initiales est `aria-hidden`. */
function names(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('cell').length > 1)
    .map((row) => within(row).getAllByRole('cell')[0]?.querySelector('strong')?.textContent ?? '')
}

/** Tous les appels à une route, verbes confondus — `apiFetch` ne pose pas `method` sur un GET. */
function callCount(fragment: string): number {
  const fetchMock = globalThis.fetch as unknown as {
    mock: { calls: [string, RequestInit | undefined][] }
  }
  return fetchMock.mock.calls.filter(([url]) => url.includes(fragment)).length
}

function callsTo(method: string, fragment: string): { body: unknown }[] {
  const fetchMock = globalThis.fetch as unknown as {
    mock: { calls: [string, RequestInit | undefined][] }
  }
  return fetchMock.mock.calls
    .filter(([url, init]) => url.includes(fragment) && init?.method === method)
    .map(([, init]) => ({ body: JSON.parse(init?.body as string) as unknown }))
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('accès à l’écran', () => {
  it('le refuse à un organisateur, sans même le monter', async () => {
    await enter(ORGANIZER)

    expect(screen.getByText(/réservée aux administrateurs/i)).not.toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
    // La liste n'est pas seulement masquée : elle n'est pas demandée.
    expect(callCount(ADMINS)).toBe(0)
  })

  it('l’ouvre à un administrateur global', async () => {
    await enter(GLOBAL_ADMIN, withAdmins([AMELIE, JULIEN]))
    const table = await screen.findByRole('table')

    expect(names(table)).toEqual(['Julien Marchand', 'Amélie Rousseau'])
    expect(screen.getByRole('status').textContent).toBe('2 administrateurs')
  })

  it('se cherche et se trie par colonne, en l’annonçant', async () => {
    await enter(GLOBAL_ADMIN, withAdmins([AMELIE, JULIEN]))
    const table = await screen.findByRole('table')

    const email = within(table).getByRole('columnheader', { name: /E-mail/ })
    fireEvent.click(within(email).getByRole('button'))
    expect(email.getAttribute('aria-sort')).toBe('ascending')
    expect(names(table)).toEqual(['Amélie Rousseau', 'Julien Marchand'])

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'marchand' } })
    expect(names(table)).toEqual(['Julien Marchand'])
    expect(screen.getByRole('status').textContent).toBe('1 administrateur')
  })
})

describe('promotion', () => {
  it('promeut par la même recherche de comptes, puis relit la liste', async () => {
    let admins = [AMELIE]
    stubSignedIn(GLOBAL_ADMIN, {
      [SEARCH]: () => jsonResponse({ accounts: [JULIEN], truncated: false }),
      [ADMINS]: () => jsonResponse(admins),
    })
    renderAt(PATHS.administrators)
    await screen.findByRole('table')

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un administrateur' }))
    fireEvent.change(screen.getByRole('searchbox', { name: /compte LeHub/i }), {
      target: { value: 'marchand' },
    })

    admins = [AMELIE, JULIEN]
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter Julien Marchand' }))

    await waitFor(() => {
      expect(callsTo('POST', ADMINS)).toEqual([{ body: { email: JULIEN.email } }])
    })
    await waitFor(() => {
      expect(names(screen.getByRole('table'))).toContain('Julien Marchand')
    })
  })

  it('rappelle le prérequis du compte LeHub quand la personne est introuvable', async () => {
    await enter(
      GLOBAL_ADMIN,
      withAdmins([AMELIE], { [SEARCH]: () => jsonResponse({ accounts: [], truncated: false }) }),
    )
    await screen.findByRole('table')

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un administrateur' }))
    fireEvent.change(screen.getByRole('searchbox', { name: /compte LeHub/i }), {
      target: { value: 'inconnu' },
    })

    expect(await screen.findByText(/Aucun compte LeHub ne correspond/)).not.toBeNull()
    expect(screen.getByText(/demandez-lui de créer un compte sur/)).not.toBeNull()
  })

  it('signale un compte déjà administrateur plutôt que de le proposer deux fois', async () => {
    await enter(
      GLOBAL_ADMIN,
      withAdmins([AMELIE], {
        [SEARCH]: () => jsonResponse({ accounts: [AMELIE], truncated: false }),
      }),
    )
    await screen.findByRole('table')

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un administrateur' }))
    fireEvent.change(screen.getByRole('searchbox', { name: /compte LeHub/i }), {
      target: { value: 'rousseau' },
    })

    expect(await screen.findByText('Déjà désigné')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Ajouter Amélie Rousseau' })).toBeNull()
  })
})

describe('retrait', () => {
  it('confirme, nomme la personne, et rappelle ce qui n’est pas touché', async () => {
    await enter(GLOBAL_ADMIN, withAdmins([AMELIE, JULIEN]))
    const table = await screen.findByRole('table')

    fireEvent.click(within(table).getByRole('button', { name: 'Retirer Amélie Rousseau' }))
    const confirmation = screen.getByRole('alertdialog')

    expect(within(confirmation).getByText('Amélie Rousseau')).not.toBeNull()
    expect(confirmation.textContent).toContain('perdra les droits globaux sur LeHub')
    expect(confirmation.textContent).toContain('Son compte LeHub n’est pas supprimé')
    expect(confirmation.textContent).toContain('désignations d’organisateur ne sont pas touchées')
  })

  it('restitue le refus du dernier administrateur sans refermer la modale', async () => {
    stubSignedIn(GLOBAL_ADMIN, {
      [ADMINS]: (attempt) =>
        attempt === 1
          ? jsonResponse([AMELIE])
          : jsonResponse(
              { code: 'LAST_GLOBAL_ADMIN', message: 'The last global administrator cannot be removed.' },
              409,
            ),
    })
    renderAt(PATHS.administrators)
    const table = await screen.findByRole('table')

    fireEvent.click(within(table).getByRole('button', { name: 'Retirer Amélie Rousseau' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Impossible de retirer le dernier administrateur')
    expect(alert.textContent).toContain('Désignez d’abord un autre administrateur')
    // La modale reste ouverte : un échec avalé ferait recliquer sans rien apprendre.
    expect(screen.getByRole('alertdialog')).not.toBeNull()

    // Et la personne est toujours là. La table n'est interrogeable qu'une fois la modale
    // refermée : Radix masque le reste du document aux technologies d'assistance tant qu'elle
    // est ouverte, ce qui la retire de l'arbre d'accessibilité que `getByRole` parcourt.
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull()
    })
    expect(names(screen.getByRole('table'))).toEqual(['Amélie Rousseau'])
    // Aucune relecture : l'écriture a échoué, il n'y a rien de nouveau à lire. Une lecture et
    // une écriture, pas trois appels.
    expect(callCount(ADMINS)).toBe(2)
  })

  it('annonce la perte des droits quand on se retire soi-même', async () => {
    await enter(GLOBAL_ADMIN, withAdmins([SELF, AMELIE]))
    const table = await screen.findByRole('table')

    fireEvent.click(within(table).getByRole('button', { name: 'Me retirer, Ada Lovelace' }))
    const confirmation = screen.getByRole('alertdialog')

    expect(confirmation.textContent).toContain('Vous perdrez les droits globaux sur LeHub')
    expect(confirmation.textContent).toContain('cette section disparaîtra')
  })

  it('retire, puis relit la liste', async () => {
    let admins = [AMELIE, JULIEN]
    stubSignedIn(GLOBAL_ADMIN, { [ADMINS]: () => jsonResponse(admins) })
    renderAt(PATHS.administrators)
    const table = await screen.findByRole('table')

    fireEvent.click(within(table).getByRole('button', { name: 'Retirer Julien Marchand' }))
    admins = [AMELIE]
    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }))

    await waitFor(() => {
      expect(callsTo('DELETE', ADMINS)).toEqual([{ body: { email: JULIEN.email } }])
    })
    await waitFor(() => {
      expect(names(screen.getByRole('table'))).toEqual(['Amélie Rousseau'])
    })
  })
})
