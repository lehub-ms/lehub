import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RESET_SENT_MESSAGE } from '@/lib/authErrors'
import { PATHS } from '@/lib/navigation'
import { renderAt } from './support/render-route'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Répond par étape, comme le tenant, pour dérouler le parcours pour de vrai. */
function stubSteps(byStep: Record<string, () => Response>) {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/api/me/session')) {
      return Promise.resolve(
        jsonResponse({
          objectId: 'o',
          email: 'ada@example.test',
          givenName: 'Ada',
          surname: 'Lovelace',
          primaryAuthMethod: 'email',
          lastAuthMethod: 'email',
        }),
      )
    }
    const body = typeof init?.body === 'string' ? init.body : '{}'
    const step = (JSON.parse(body) as { step?: string }).step ?? ''
    const responder = byStep[step]
    return Promise.resolve(responder ? responder() : jsonResponse({ continuation_token: 'ct' }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function askForCode(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.type(screen.getByLabelText('Adresse email'), email)
  await user.click(screen.getByRole('button', { name: /envoyer le code/i }))
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('réinitialisation du mot de passe', () => {
  it('rend les trois étapes sans jamais quitter le domaine', async () => {
    const user = userEvent.setup()
    stubSteps({
      start: () => jsonResponse({ continuation_token: 'ct1' }),
      challenge: () =>
        jsonResponse({ continuation_token: 'ct2', code_length: 4, challenge_target_label: 'a***@e***' }),
      continue: () => jsonResponse({ continuation_token: 'ct3' }),
    })

    renderAt(PATHS.resetPassword)
    expect(screen.getByRole('heading', { name: /mot de passe oublié/i })).not.toBeNull()

    await askForCode(user, 'ada@example.test')
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /entrez le code reçu/i })).not.toBeNull(),
    )

    const cells = screen.getAllByRole('textbox')
    expect(cells).toHaveLength(4)
    for (const [index, digit] of [...'1234'].entries()) {
      await user.type(cells[index]!, digit)
    }

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /nouveau mot de passe/i })).not.toBeNull(),
    )
  })

  it("répond la même chose à une adresse inconnue qu'à une adresse connue", async () => {
    const user = userEvent.setup()

    // Adresse connue.
    stubSteps({
      start: () => jsonResponse({ continuation_token: 'ct1' }),
      challenge: () => jsonResponse({ continuation_token: 'ct2', code_length: 4 }),
    })
    const known = renderAt(PATHS.resetPassword)
    await askForCode(user, 'ada@example.test')
    await waitFor(() => expect(screen.getByRole('heading', { name: /entrez le code/i })).not.toBeNull())
    const knownNotice = screen.getByText(RESET_SENT_MESSAGE).textContent
    known.unmount()
    vi.unstubAllGlobals()

    // Adresse inconnue : le tenant répond `user_not_found`, un oracle offert en clair.
    stubSteps({ start: () => jsonResponse({ error: 'user_not_found' }, 400) })
    renderAt(PATHS.resetPassword)
    await askForCode(user, 'inconnu@example.test')
    await waitFor(() => expect(screen.getByRole('heading', { name: /entrez le code/i })).not.toBeNull())

    // Même écran, même message, au caractère près.
    expect(screen.getByText(RESET_SENT_MESSAGE).textContent).toBe(knownNotice)
    expect(screen.queryByText(/n’existe pas|aucun compte|compte introuvable/i)).toBeNull()
  })

  it("refuse le code d'une adresse inconnue comme un code incorrect", async () => {
    const user = userEvent.setup()
    stubSteps({ start: () => jsonResponse({ error: 'user_not_found' }, 400) })

    renderAt(PATHS.resetPassword)
    await askForCode(user, 'inconnu@example.test')
    await waitFor(() => expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0))

    const cells = screen.getAllByRole('textbox')
    for (const [index, digit] of [...'12345678'].entries()) {
      await user.type(cells[index]!, digit)
    }

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Ce code est incorrect. Vérifiez-le et saisissez-le à nouveau.')
  })

  it('nomme la cause exacte du refus du nouveau mot de passe', async () => {
    const user = userEvent.setup()
    stubSteps({
      start: () => jsonResponse({ continuation_token: 'ct1' }),
      challenge: () => jsonResponse({ continuation_token: 'ct2', code_length: 4 }),
      continue: () => jsonResponse({ continuation_token: 'ct3' }),
      submit: () => jsonResponse({ error: 'invalid_grant', suberror: 'password_recently_used' }, 400),
    })

    renderAt(PATHS.resetPassword)
    await askForCode(user, 'ada@example.test')
    await waitFor(() => expect(screen.getAllByRole('textbox').length).toBe(4))
    const cells = screen.getAllByRole('textbox')
    for (const [index, digit] of [...'1234'].entries()) {
      await user.type(cells[index]!, digit)
    }
    await waitFor(() => expect(screen.getByLabelText('Nouveau mot de passe', { selector: 'input' })).not.toBeNull())

    await user.type(screen.getByLabelText('Nouveau mot de passe', { selector: 'input' }), 'Ancien-Mot-2')
    await user.click(screen.getByRole('button', { name: /définir mon nouveau mot de passe/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('déjà été utilisé récemment')
  })
})
