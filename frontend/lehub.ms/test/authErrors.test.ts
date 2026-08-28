import { describe, expect, it } from 'vitest'
import {
  authMessage,
  FLOW_CONTROL_ERRORS,
  MESSAGE_TABLE,
  RESET_SENT_MESSAGE,
  type AuthFlow,
} from '../src/lib/authErrors'

const FLOWS: AuthFlow[] = ['signup', 'signin', 'reset']

/** Chaque couple répertorié, parcours par parcours — la table entière, pas un échantillon. */
function everyEntry(): { flow: AuthFlow; kind: 'suberror' | 'error'; code: string; message: string }[] {
  return FLOWS.flatMap((flow) => [
    ...Object.entries(MESSAGE_TABLE[flow].subErrors).map(([code, message]) => ({
      flow,
      kind: 'suberror' as const,
      code,
      message,
    })),
    ...Object.entries(MESSAGE_TABLE[flow].errors).map(([code, message]) => ({
      flow,
      kind: 'error' as const,
      code,
      message,
    })),
  ])
}

describe('authMessage', () => {
  it('restitue le message attendu pour chaque couple répertorié', () => {
    for (const { flow, kind, code, message } of everyEntry()) {
      const response = kind === 'suberror' ? { error: 'invalid_grant', suberror: code } : { error: code }
      expect(authMessage(flow, response), `${flow}/${kind}/${code}`).toBe(message)
    }
  })

  it('fait primer le sous-code sur le code — le bug que le legacy a livré', () => {
    // Un refus générique accompagné d'un sous-code « mot de passe interdit » est un mot de
    // passe interdit, pas un identifiant incorrect.
    const message = authMessage('signin', { error: 'invalid_grant', suberror: 'invalid_oob_value' })
    expect(message).toBe('Ce code est incorrect. Vérifiez-le et saisissez-le à nouveau.')
    expect(message).not.toBe(authMessage('signin', { error: 'invalid_grant' }))
  })

  it('retombe sur le code connu quand le sous-code est inconnu, avant le message générique', () => {
    const message = authMessage('signup', { error: 'user_already_exists', suberror: 'jamais_vu' })
    expect(message).toBe(MESSAGE_TABLE.signup.errors['user_already_exists'])
    expect(message).not.toBe(MESSAGE_TABLE.signup.fallback)
  })

  it('produit le repli du parcours courant pour un code non répertorié', () => {
    for (const flow of FLOWS) {
      expect(authMessage(flow, { error: 'quelque_chose_de_neuf' }), flow).toBe(MESSAGE_TABLE[flow].fallback)
    }
  })

  it("ne rend jamais un écran vide, même sans code exploitable", () => {
    for (const flow of FLOWS) {
      for (const response of [{}, { error: null }, { error: '' }, { error: null, suberror: null }]) {
        const message = authMessage(flow, response)
        expect(message, `${flow} ${JSON.stringify(response)}`).toBe(MESSAGE_TABLE[flow].fallback)
        expect(message.length).toBeGreaterThan(10)
      }
    }
  })

  it("n'affiche « Email ou mot de passe incorrect » dans aucun parcours autre que la connexion", () => {
    const forbidden = 'Email ou mot de passe incorrect.'
    for (const { flow, code, message } of everyEntry()) {
      if (flow === 'signin') continue
      expect(message, `${flow}/${code}`).not.toBe(forbidden)
    }
    for (const flow of FLOWS) {
      if (flow === 'signin') continue
      expect(MESSAGE_TABLE[flow].fallback, flow).not.toBe(forbidden)
      expect(authMessage(flow, { error: 'invalid_grant' }), flow).not.toBe(forbidden)
    }
    // Et il est bien là où il a un sens.
    expect(authMessage('signin', { error: 'invalid_grant' })).toBe(forbidden)
  })

  it("ne laisse aucun libellé brut d'External ID atteindre l'utilisateur", () => {
    const rawCode = /[a-z]+_[a-z_]+/
    for (const { flow, code, message } of everyEntry()) {
      expect(message, `${flow}/${code}`).not.toMatch(rawCode)
    }
    for (const flow of FLOWS) {
      expect(MESSAGE_TABLE[flow].fallback, flow).not.toMatch(rawCode)
    }
  })

  it('donne au même code des messages distincts et pertinents selon le parcours', () => {
    const messages = FLOWS.map((flow) => authMessage(flow, { error: 'expired_token' }))
    expect(new Set(messages).size).toBe(FLOWS.length)
    expect(messages[0]).toContain('inscription')
    expect(messages[1]).toContain('connexion')
    expect(messages[2]).toContain('réinitialisation')
  })
})

describe('neutralité de la première étape de réinitialisation', () => {
  it("répond à une adresse inconnue exactement ce qu'il répond à une adresse connue", () => {
    // La même chaîne, littéralement : deux libellés écrits séparément finissent par diverger,
    // et le jour où ils divergent l'écran devient un oracle d'existence de compte.
    expect(authMessage('reset', { error: 'user_not_found' })).toBe(RESET_SENT_MESSAGE)
  })

  it('ne révèle rien non plus par le message de repli', () => {
    expect(MESSAGE_TABLE.reset.fallback).not.toContain('compte')
    expect(authMessage('reset', { error: 'user_not_found' })).not.toContain('existe pas')
  })
})

describe('FLOW_CONTROL_ERRORS', () => {
  it("ne figure dans aucune table : ce sont des étapes, pas des échecs", () => {
    for (const code of FLOW_CONTROL_ERRORS) {
      for (const flow of FLOWS) {
        expect(MESSAGE_TABLE[flow].errors[code], `${flow}/${code}`).toBeUndefined()
        expect(MESSAGE_TABLE[flow].subErrors[code], `${flow}/${code}`).toBeUndefined()
      }
    }
  })
})
