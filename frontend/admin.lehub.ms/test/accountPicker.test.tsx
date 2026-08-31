import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@lehub/shared/auth/AuthProvider'
import { AccountPicker } from '@/components/people/AccountPicker'
import type { Account } from '@/lib/api'
import { GLOBAL_ADMIN } from './support/session-fixtures'
import { jsonResponse, stubSignedIn, type FetchOverrides } from './support/stub-session'

const AMELIE: Account = {
  givenName: 'Amélie',
  surname: 'Rousseau',
  email: 'amelie.rousseau@lehub.invalid',
}
const JULIEN: Account = { givenName: 'Julien', surname: 'Marchand', email: 'julien@lehub.invalid' }

const SEARCH = '/api/manage/accounts/search'

/** Les corps envoyés à la recherche, dans l'ordre : c'est ce qui dit ce que le serveur a vu. */
function searchBodies(): { q: string }[] {
  const fetchMock = globalThis.fetch as unknown as {
    mock: { calls: [string, RequestInit | undefined][] }
  }
  return fetchMock.mock.calls
    .filter(([url, init]) => url.includes(SEARCH) && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)) as { q: string })
}

function answers(result: { accounts: Account[]; truncated?: boolean }): FetchOverrides {
  return {
    [SEARCH]: () => jsonResponse({ truncated: false, ...result }),
  }
}

interface OpenOptions {
  designatedEmails?: string[]
  onDesignate?: (account: Account) => Promise<void>
}

function open(overrides: FetchOverrides, options: OpenOptions = {}): void {
  stubSignedIn(GLOBAL_ADMIN, overrides)
  render(
    <AuthProvider>
      <AccountPicker
        open
        onOpenChange={() => undefined}
        title="Ajouter un organisateur"
        subtitle="Sélectionnez un compte LeHub existant"
        designatedEmails={options.designatedEmails ?? []}
        onDesignate={options.onDesignate ?? (() => Promise.resolve())}
      />
    </AuthProvider>,
  )
}

function type(value: string): void {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value } })
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('le tiroir ne donne pas accès à l’annuaire', () => {
  it('n’interroge rien et n’affiche rien tant qu’on n’a rien tapé', async () => {
    open(answers({ accounts: [AMELIE] }))

    expect(screen.getByText(/Tapez au moins 2 caractères/)).not.toBeNull()
    // Laisser passer le débounce : l'absence de requête doit tenir dans le temps, pas seulement
    // au premier rendu.
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(searchBodies()).toEqual([])
  })

  it('n’interroge pas non plus sous la longueur minimale annoncée', async () => {
    open(answers({ accounts: [AMELIE] }))

    type('r')
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(searchBodies()).toEqual([])
    expect(screen.getByText(/Tapez au moins 2 caractères/)).not.toBeNull()
  })

  it('cherche dès la longueur atteinte, et revient à l’indice si l’on efface', async () => {
    open(answers({ accounts: [AMELIE] }))

    type('rou')
    await screen.findByText('Amélie Rousseau')
    expect(searchBodies()).toEqual([{ q: 'rou' }])

    // Repasser sous le seuil ne doit pas laisser à l'écran des résultats qui ne correspondent
    // plus à ce qui est écrit.
    type('r')
    expect(screen.queryByText('Amélie Rousseau')).toBeNull()
    expect(screen.getByText(/Tapez au moins 2 caractères/)).not.toBeNull()
  })

  it('n’envoie qu’une requête pour une saisie enchaînée', async () => {
    open(answers({ accounts: [AMELIE] }))

    type('ro')
    type('rou')
    type('rous')
    await screen.findByText('Amélie Rousseau')

    expect(searchBodies()).toEqual([{ q: 'rous' }])
  })
})

describe('résultats', () => {
  it('rend le nom et l’adresse, et rien d’autre', async () => {
    open(answers({ accounts: [AMELIE] }))

    type('rou')
    const row = (await screen.findByText('Amélie Rousseau')).closest('li')

    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText(AMELIE.email)).not.toBeNull()
  })

  it('signale un compte déjà désigné au lieu de le proposer une seconde fois', async () => {
    open(answers({ accounts: [AMELIE, JULIEN] }), { designatedEmails: [AMELIE.email] })

    type('lehub')
    await screen.findByText('Amélie Rousseau')

    expect(screen.getByText('Déjà désigné')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Ajouter Amélie Rousseau' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Ajouter Julien Marchand' })).not.toBeNull()
  })

  it('reconnaît une adresse déjà désignée quelle que soit sa casse', async () => {
    // La colonne est unique sous une collation insensible à la casse : deux graphies de la même
    // adresse sont la même personne, et la proposer une seconde fois serait un doublon.
    open(answers({ accounts: [AMELIE] }), { designatedEmails: [AMELIE.email.toUpperCase()] })

    type('rou')
    await screen.findByText('Amélie Rousseau')

    expect(screen.getByText('Déjà désigné')).not.toBeNull()
  })

  it('annonce le dépassement plutôt que de tronquer en silence', async () => {
    open(answers({ accounts: [AMELIE], truncated: true }))

    type('lehub')
    await screen.findByText('Amélie Rousseau')

    expect(screen.getByText(/Plus de 20 comptes correspondent/)).not.toBeNull()
  })

  it('rappelle le prérequis du compte LeHub quand la recherche ne rend rien', async () => {
    open(answers({ accounts: [] }))

    type('zzz')

    await waitFor(() => {
      expect(screen.getByText(/Aucun compte LeHub ne correspond/)).not.toBeNull()
    })
    // La note permanente : la question « pourquoi je ne la trouve pas ? » a une réponse, et elle
    // ne dépend pas du résultat.
    expect(screen.getByText(/demandez-lui de créer un compte sur/)).not.toBeNull()
  })

  it('affiche la note du prérequis même avant toute recherche', () => {
    open(answers({ accounts: [] }))

    expect(screen.getByText(/demandez-lui de créer un compte sur/)).not.toBeNull()
  })
})

describe('désignation depuis le tiroir', () => {
  it('passe le compte choisi à l’écran', async () => {
    const designated: Account[] = []
    open(answers({ accounts: [AMELIE, JULIEN] }), {
      onDesignate: (account) => {
        designated.push(account)
        return Promise.resolve()
      },
    })

    type('lehub')
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter Amélie Rousseau' }))

    await waitFor(() => {
      expect(designated).toEqual([AMELIE])
    })
  })

  it('dit ce qui a échoué, sur la ligne concernée, sans refermer le tiroir', async () => {
    open(answers({ accounts: [AMELIE] }), {
      onDesignate: () => Promise.reject(new Error('boom')),
    })

    type('rou')
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter Amélie Rousseau' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('La désignation a échoué')
    expect(screen.getByRole('dialog')).not.toBeNull()
  })
})
