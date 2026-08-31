import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionPermissions } from '@lehub/shared/auth/AuthContext'
import { communityPath } from '@/lib/navigation'
import type { Account } from '@/lib/api'
import { renderAt } from './support/render-route'
import { COMMUNITIES, GLOBAL_ADMIN, MIRROR, ORGANIZER } from './support/session-fixtures'
import { jsonResponse, stubSignedIn, type FetchOverrides } from './support/stub-session'

const MINE = COMMUNITIES[0]!
const OTHER = COMMUNITIES[1]!

const AMELIE: Account = {
  givenName: 'Amélie',
  surname: 'Rousseau',
  email: 'amelie.rousseau@lehub.invalid',
}
const JULIEN: Account = { givenName: 'Julien', surname: 'Marchand', email: 'julien@lehub.invalid' }
/** La session elle-même, pour l'auto-retrait : `MIRROR` est ce que rend `POST /api/me/session`. */
const SELF: Account = {
  givenName: MIRROR.givenName,
  surname: MIRROR.surname,
  email: MIRROR.email,
}

const ORGANIZERS = `/api/manage/communities/${MINE.id}/organizers`
const SEARCH = '/api/manage/accounts/search'

function withOrganizers(people: Account[], extra: FetchOverrides = {}): FetchOverrides {
  return {
    // Avant `/api/manage/communities`, que le préfixe attraperait sinon.
    [ORGANIZERS]: () => jsonResponse(people),
    ...extra,
  }
}

/** Voir #169 : on attend la donnée chargée, pas le repère de navigation. */
async function enter(
  permissions: SessionPermissions,
  overrides: FetchOverrides,
  community = MINE,
): Promise<HTMLElement> {
  stubSignedIn(permissions, overrides)
  renderAt(communityPath(community.slug, 'organisateurs'))
  return screen.findByRole('table')
}

/**
 * Les noms des lignes, en excluant la ligne vide qui n'a qu'une cellule.
 *
 * Le `<strong>` plutôt que le texte de la cellule : le disque d'initiales est `aria-hidden`,
 * donc absent de ce qu'un lecteur d'écran annonce, mais bien présent dans `textContent` — s'y
 * fier lirait « ARAmélie Rousseau ».
 */
function names(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('cell').length > 1)
    .map((row) => within(row).getAllByRole('cell')[0]?.querySelector('strong')?.textContent ?? '')
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

describe('liste des organisateurs', () => {
  it('porte la communauté sélectionnée dans son titre', async () => {
    await enter(ORGANIZER, withOrganizers([AMELIE]))

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Organisateurs')
    expect(screen.getAllByText(MINE.name).length).toBeGreaterThan(0)
  })

  it('liste les personnes désignées avec leur nom et leur adresse, et annonce leur nombre', async () => {
    const table = await enter(ORGANIZER, withOrganizers([AMELIE, JULIEN]))

    expect(names(table)).toEqual(['Julien Marchand', 'Amélie Rousseau'])
    expect(within(table).getByText(AMELIE.email)).not.toBeNull()
    expect(screen.getByRole('status').textContent).toBe('2 organisateurs')
  })

  it('se cherche par nom et par adresse, et le décompte suit', async () => {
    const table = await enter(ORGANIZER, withOrganizers([AMELIE, JULIEN]))

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'rousseau' } })
    expect(names(table)).toEqual(['Amélie Rousseau'])
    expect(screen.getByRole('status').textContent).toBe('1 organisateur')

    // Sur l'adresse aussi, et sans accent : « julien@… » comme « Amélie ».
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'julien@' } })
    expect(names(table)).toEqual(['Julien Marchand'])

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'amelie' } })
    expect(names(table)).toEqual(['Amélie Rousseau'])
  })

  it('se trie par colonne, en l’annonçant', async () => {
    const table = await enter(ORGANIZER, withOrganizers([AMELIE, JULIEN]))
    const nom = within(table).getByRole('columnheader', { name: /Nom/ })

    expect(nom.getAttribute('aria-sort')).toBe('ascending')

    fireEvent.click(within(nom).getByRole('button'))
    expect(nom.getAttribute('aria-sort')).toBe('descending')
    expect(names(table)).toEqual(['Amélie Rousseau', 'Julien Marchand'])
  })

  it('dit qu’il n’y a personne sans en faire une anomalie', async () => {
    stubSignedIn(ORGANIZER, withOrganizers([]))
    renderAt(communityPath(MINE.slug, 'organisateurs'))

    expect(await screen.findByText(/Aucun organisateur pour le moment/)).not.toBeNull()
    expect(screen.getByText(/reste gérable par les administrateurs globaux/)).not.toBeNull()
  })

  it('recharge la liste au changement de communauté', async () => {
    const otherRoute = `/api/manage/communities/${OTHER.id}/organizers`
    await enter(
      GLOBAL_ADMIN,
      withOrganizers([AMELIE], { [otherRoute]: () => jsonResponse([JULIEN]) }),
    )

    expect(names(screen.getByRole('table'))).toEqual(['Amélie Rousseau'])

    const trigger = await screen.findByRole('button', { name: /changer de communauté/i })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitemradio', { name: OTHER.name }))

    await waitFor(() => {
      expect(names(screen.getByRole('table'))).toEqual(['Julien Marchand'])
    })
  })
})

describe('désignation depuis l’écran', () => {
  it('ajoute par le tiroir de recherche, puis relit la liste', async () => {
    let organizers = [AMELIE]
    stubSignedIn(ORGANIZER, {
      [SEARCH]: () => jsonResponse({ accounts: [JULIEN], truncated: false }),
      [ORGANIZERS]: () => jsonResponse(organizers),
    })
    renderAt(communityPath(MINE.slug, 'organisateurs'))
    await screen.findByRole('table')

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un organisateur' }))
    fireEvent.change(screen.getByRole('searchbox', { name: /compte LeHub/i }), {
      target: { value: 'marchand' },
    })

    organizers = [AMELIE, JULIEN]
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter Julien Marchand' }))

    await waitFor(() => {
      expect(callsTo('POST', ORGANIZERS)).toEqual([{ body: { email: JULIEN.email } }])
    })
    // Relue plutôt que rapiécée : le serveur fait foi.
    await waitFor(() => {
      expect(names(screen.getByRole('table'))).toContain('Julien Marchand')
    })
  })

  it('signale un organisateur déjà désigné au lieu de le proposer deux fois', async () => {
    await enter(
      ORGANIZER,
      withOrganizers([AMELIE], {
        [SEARCH]: () => jsonResponse({ accounts: [AMELIE, JULIEN], truncated: false }),
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un organisateur' }))
    fireEvent.change(screen.getByRole('searchbox', { name: /compte LeHub/i }), {
      target: { value: 'lehub' },
    })

    expect(await screen.findByText('Déjà désigné')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Ajouter Amélie Rousseau' })).toBeNull()
  })
})

describe('retrait', () => {
  it('confirme, nomme la personne, et rappelle que son compte n’est pas supprimé', async () => {
    const table = await enter(ORGANIZER, withOrganizers([AMELIE]))

    fireEvent.click(within(table).getByRole('button', { name: 'Retirer Amélie Rousseau' }))
    const confirmation = screen.getByRole('alertdialog')

    expect(within(confirmation).getByText('Amélie Rousseau')).not.toBeNull()
    expect(confirmation.textContent).toContain('Son compte LeHub n’est pas supprimé')
    expect(confirmation.textContent).toContain('évènements qu’elle a créés')
  })

  it('retire, puis relit la liste', async () => {
    let organizers = [AMELIE, JULIEN]
    stubSignedIn(ORGANIZER, { [ORGANIZERS]: () => jsonResponse(organizers) })
    renderAt(communityPath(MINE.slug, 'organisateurs'))
    const table = await screen.findByRole('table')

    fireEvent.click(within(table).getByRole('button', { name: 'Retirer Julien Marchand' }))
    organizers = [AMELIE]
    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }))

    await waitFor(() => {
      expect(names(screen.getByRole('table'))).toEqual(['Amélie Rousseau'])
    })
  })

  it('annonce la perte d’accès quand on se retire soi-même', async () => {
    const table = await enter(ORGANIZER, withOrganizers([SELF]))

    fireEvent.click(within(table).getByRole('button', { name: `Me retirer, Ada Lovelace` }))
    const confirmation = screen.getByRole('alertdialog')

    expect(confirmation.textContent).toContain('Vous perdrez l’accès à cette communauté')
    expect(confirmation.textContent).toContain('sans avoir à vous reconnecter')
  })

  it('garde la modale ouverte et dit ce qui a échoué', async () => {
    stubSignedIn(ORGANIZER, {
      [ORGANIZERS]: (attempt) =>
        attempt === 1 ? jsonResponse([AMELIE]) : jsonResponse({ code: 'FORBIDDEN' }, 403),
    })
    renderAt(communityPath(MINE.slug, 'organisateurs'))
    const table = await screen.findByRole('table')

    fireEvent.click(within(table).getByRole('button', { name: 'Retirer Amélie Rousseau' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Vous n’êtes plus autorisé')
    expect(screen.getByRole('alertdialog')).not.toBeNull()
  })
})
