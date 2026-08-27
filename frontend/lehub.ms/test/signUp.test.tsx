import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OtpInput } from '@/components/form/OtpInput'
import { renderAt } from './support/render-route'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Les corps envoyés au relais, dans l'ordre, pour vérifier ce qui part réellement. */
function recordCalls(responses: (() => Response)[]) {
  const bodies: Record<string, unknown>[] = []
  let call = 0
  const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
    // `body` est toujours une chaîne ici : le client sérialise en JSON avant d'appeler.
    const body = typeof init?.body === 'string' ? init.body : '{}'
    bodies.push(JSON.parse(body) as Record<string, unknown>)
    const next = responses[Math.min(call, responses.length - 1)]
    call += 1
    return Promise.resolve(next ? next() : jsonResponse({}))
  })
  vi.stubGlobal('fetch', fetchMock)
  return { bodies, fetchMock }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('OtpInput', () => {
  it('soumet la valeur fraîche à la dernière frappe, jamais un état en retard', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<OtpInput length={4} label="Code" onComplete={onComplete} />)

    const cells = screen.getAllByRole('textbox')
    for (const [index, digit] of [...'1234'].entries()) {
      await user.type(cells[index]!, digit)
    }

    // Le bug du legacy : le gestionnaire relisait l'état React, pas encore appliqué, et
    // répondait « entrez le code » à l'instant même où le dernier chiffre était saisi.
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith('1234')
  })

  it('avance de case en case et recule sur retour arrière', async () => {
    const user = userEvent.setup()
    render(<OtpInput length={4} label="Code" onComplete={vi.fn()} />)
    const cells = screen.getAllByRole('textbox')

    await user.type(cells[0]!, '1')
    expect(document.activeElement).toBe(cells[1])

    await user.keyboard('{Backspace}')
    expect(document.activeElement).toBe(cells[0])
  })

  it('répartit un collage sur toutes les cases', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<OtpInput length={4} label="Code" onComplete={onComplete} />)

    await user.click(screen.getAllByRole('textbox')[0]!)
    await user.paste('9876')

    expect(onComplete).toHaveBeenCalledWith('9876')
  })

  it("n'accepte que des chiffres", async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<OtpInput length={4} label="Code" onComplete={onComplete} />)

    await user.type(screen.getAllByRole('textbox')[0]!, 'a')
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('prévient à chaque frappe pour que le message précédent disparaisse', async () => {
    const user = userEvent.setup()
    const onType = vi.fn()
    render(<OtpInput length={4} label="Code" onComplete={vi.fn()} onType={onType} />)

    await user.type(screen.getAllByRole('textbox')[0]!, '1')
    expect(onType).toHaveBeenCalled()
  })
})

describe("page d'inscription", () => {
  it('collecte les quatre champs et transmet prénom et nom comme attributs', async () => {
    const user = userEvent.setup()
    const { bodies } = recordCalls([
      () => jsonResponse({ continuation_token: 'ct1' }),
      () => jsonResponse({ continuation_token: 'ct2', code_length: 8, challenge_target_label: 'j***@e***' }),
    ])

    renderAt('/inscription')

    await user.type(screen.getByLabelText('Prénom'), 'Ada')
    await user.type(screen.getByLabelText('Nom'), 'Lovelace')
    await user.type(screen.getByLabelText('Adresse email'), 'ada@example.test')
    await user.type(screen.getByLabelText('Mot de passe'), 'Correct-Horse-8')
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }))

    await waitFor(() => expect(bodies.length).toBeGreaterThanOrEqual(1))
    expect(bodies[0]).toMatchObject({
      step: 'start',
      username: 'ada@example.test',
      attributes: { givenName: 'Ada', surname: 'Lovelace' },
    })
    // Le mot de passe n'est pas envoyé à cette étape : le protocole ne le réclame qu'après
    // la vérification de l'adresse.
    expect(bodies[0]).not.toHaveProperty('password')
  })

  it('mène à la saisie du code, avec la longueur annoncée par le tenant', async () => {
    const user = userEvent.setup()
    recordCalls([
      () => jsonResponse({ continuation_token: 'ct1' }),
      () => jsonResponse({ continuation_token: 'ct2', code_length: 8, challenge_target_label: 'a***@e***' }),
    ])

    renderAt('/inscription')
    await user.type(screen.getByLabelText('Prénom'), 'Ada')
    await user.type(screen.getByLabelText('Nom'), 'Lovelace')
    await user.type(screen.getByLabelText('Adresse email'), 'ada@example.test')
    await user.type(screen.getByLabelText('Mot de passe'), 'Correct-Horse-8')
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /vérifiez votre email/i })).not.toBeNull(),
    )
    // Huit cases parce que le tenant a annoncé huit, pas parce que c'est écrit en dur.
    expect(screen.getAllByRole('textbox')).toHaveLength(8)
    expect(screen.getByText(/a\*\*\*@e\*\*\*/)).not.toBeNull()
  })

  it('affiche le refus du tenant en français et l’efface à la frappe suivante', async () => {
    const user = userEvent.setup()
    recordCalls([() => jsonResponse({ error: 'user_already_exists' }, 400)])

    renderAt('/inscription')
    await user.type(screen.getByLabelText('Prénom'), 'Ada')
    await user.type(screen.getByLabelText('Nom'), 'Lovelace')
    await user.type(screen.getByLabelText('Adresse email'), 'ada@example.test')
    await user.type(screen.getByLabelText('Mot de passe'), 'Correct-Horse-8')
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Un compte existe déjà avec cette adresse')
    // Et surtout, pas le message d'un autre parcours.
    expect(alert.textContent).not.toContain('Email ou mot de passe incorrect')

    await user.type(screen.getByLabelText('Adresse email'), 'x')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it("n'oppose aucune règle de complexité à la soumission", async () => {
    const user = userEvent.setup()
    const { fetchMock } = recordCalls([() => jsonResponse({ continuation_token: 'ct1' })])

    renderAt('/inscription')
    await user.type(screen.getByLabelText('Prénom'), 'Ada')
    await user.type(screen.getByLabelText('Nom'), 'Lovelace')
    await user.type(screen.getByLabelText('Adresse email'), 'ada@example.test')
    // Court, sans majuscule, sans chiffre : les trois exigences affichées sont en défaut.
    await user.type(screen.getByLabelText('Mot de passe'), 'court')
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }))

    // La SPA laisse passer : c'est le tenant qui arbitre, pas elle.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  })

  it('associe chaque intitulé à son champ et respecte le plancher tactile', () => {
    vi.stubGlobal('fetch', vi.fn())
    renderAt('/inscription')

    for (const label of ['Prénom', 'Nom', 'Adresse email', 'Mot de passe']) {
      expect(screen.getByLabelText(label), label).not.toBeNull()
    }
    expect(screen.getByRole('button', { name: /créer mon compte/i }).className).toContain('min-h-12')
    expect(
      screen.getByRole('button', { name: /afficher le mot de passe/i }).className,
    ).toContain('size-11')
  })
})
