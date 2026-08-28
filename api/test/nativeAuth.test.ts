import { describe, expect, it } from 'vitest'
import { buildEntraConfig, type EntraConfig } from '../src/lib/entraConfig'
import {
  buildStepForm,
  hasProgress,
  lookupStep,
  projectResponse,
  stepNames,
  type AuthFlow,
} from '../src/lib/nativeAuth'

const TENANT = 'f5850776-0bc8-402e-85e9-1d8713d64ddb'
const CLIENT = '0ba42dc6-26d6-448c-b235-8ef540730c7e'

const CONFIG: EntraConfig = (() => {
  const result = buildEntraConfig({
    ENTRA_TENANT_ID: TENANT,
    ENTRA_CLIENT_ID: CLIENT,
    ENTRA_AUTHORITY: `https://lehubextiddev.ciamlogin.com/${TENANT}/v2.0`,
    ENTRA_ISSUER: `https://${TENANT}.ciamlogin.com/${TENANT}/v2.0`,
  })
  if (!result.ok) throw new Error('the test fixture must be a valid configuration')
  return result.config
})()

/** Shorthand: resolve a step and transpose a body in one go. */
function formFor(flow: AuthFlow, step: string, body: Record<string, unknown>) {
  const spec = lookupStep(flow, step)
  if (!spec) throw new Error(`unknown step ${flow}/${step}`)
  return buildStepForm(spec, body, CONFIG)
}

describe('lookupStep', () => {
  it('résout les étapes déclarées de chacun des quatre parcours', () => {
    const expected: Record<AuthFlow, string[]> = {
      signup: ['start', 'challenge', 'continue', 'token'],
      signin: ['start', 'challenge', 'token'],
      reset: ['start', 'challenge', 'continue', 'submit', 'poll', 'token'],
      token: ['refresh'],
    }
    for (const [flow, steps] of Object.entries(expected) as [AuthFlow, string[]][]) {
      expect(stepNames(flow), flow).toEqual(steps)
      for (const step of steps) {
        expect(lookupStep(flow, step), `${flow}/${step}`).not.toBeNull()
      }
    }
  })

  it('refuse une étape inconnue plutôt que de construire un appel à l’aveugle', () => {
    // `constructor` et `toString` sont sur le prototype de tout objet : une table interrogée
    // sans garde les résoudrait en fonctions et l'étape passerait pour déclarée.
    for (const step of ['', 'unknown', 'START', 'constructor', 'toString', '__proto__']) {
      expect(lookupStep('signup', step), step).toBeNull()
    }
    for (const step of [undefined, null, 42, {}, ['start']]) {
      expect(lookupStep('signup', step), JSON.stringify(step)).toBeNull()
    }
    // Une étape valide dans un autre parcours n'est pas valide ici.
    expect(lookupStep('token', 'start')).toBeNull()
    expect(lookupStep('signin', 'submit')).toBeNull()
  })
})

describe('buildStepForm', () => {
  it("ajoute l'identifiant client sur chaque étape, et le caller ne peut pas le changer", () => {
    for (const [flow, step] of [
      ['signup', 'start'],
      ['signin', 'token'],
      ['reset', 'poll'],
      ['token', 'refresh'],
    ] as [AuthFlow, string][]) {
      const result = formFor(flow, step, {
        username: 'ada@example.test',
        continuation_token: 'ct',
        refresh_token: 'rt',
        password: 'p',
        oob: '123456',
        grant_type: flow === 'signin' ? 'password' : undefined,
        client_id: 'attacker-controlled',
      })
      expect(result.ok, `${flow}/${step}`).toBe(true)
      if (!result.ok) return
      expect(result.form.get('client_id')).toBe(CLIENT)
    }
  })

  it('déclare toujours le type de challenge redirect exigé par Entra', () => {
    for (const [flow, step] of [
      ['signup', 'start'],
      ['signup', 'challenge'],
      ['signin', 'start'],
      ['signin', 'challenge'],
      ['reset', 'start'],
      ['reset', 'challenge'],
    ] as [AuthFlow, string][]) {
      const result = formFor(flow, step, { username: 'ada@example.test', continuation_token: 'ct' })
      if (!result.ok) return
      expect(result.form.get('challenge_type'), `${flow}/${step}`).toContain('redirect')
    }
  })

  it("porte la portée sur les seules étapes qui demandent des jetons, et jamais celle du caller", () => {
    const withScope: [AuthFlow, string][] = [
      ['signup', 'token'],
      ['signin', 'token'],
      ['reset', 'token'],
      ['token', 'refresh'],
    ]
    for (const [flow, step] of withScope) {
      const result = formFor(flow, step, {
        continuation_token: 'ct',
        refresh_token: 'rt',
        grant_type: 'continuation_token',
        scope: 'https://graph.microsoft.com/.default',
      })
      if (!result.ok) return
      expect(result.form.get('scope'), `${flow}/${step}`).toContain('offline_access')
      expect(result.form.get('scope')).not.toContain('graph.microsoft.com')
    }

    const noScope = formFor('signup', 'start', { username: 'ada@example.test' })
    if (!noScope.ok) return
    expect(noScope.form.get('scope')).toBeNull()
  })

  it('pose lui-même le type de grant quand celui-ci est fixe', () => {
    const cases: [AuthFlow, string, string][] = [
      ['signup', 'token', 'continuation_token'],
      ['reset', 'continue', 'oob'],
      ['token', 'refresh', 'refresh_token'],
    ]
    for (const [flow, step, grant] of cases) {
      const result = formFor(flow, step, {
        continuation_token: 'ct',
        refresh_token: 'rt',
        oob: '123456',
        grant_type: 'attacker-controlled',
      })
      if (!result.ok) return
      expect(result.form.get('grant_type'), `${flow}/${step}`).toBe(grant)
    }
  })

  it("n'accepte du caller qu'un type de grant de la liste blanche de l'étape", () => {
    for (const grant of ['password', 'oob', 'continuation_token']) {
      const result = formFor('signin', 'token', { continuation_token: 'ct', grant_type: grant, password: 'p' })
      expect(result.ok, grant).toBe(true)
      if (!result.ok) return
      expect(result.form.get('grant_type')).toBe(grant)
    }
    for (const grant of ['client_credentials', 'refresh_token', '', undefined]) {
      const result = formFor('signin', 'token', { continuation_token: 'ct', grant_type: grant })
      expect(result.ok, String(grant)).toBe(false)
      if (result.ok) return
      expect(result.code).toBe('UNSUPPORTED_GRANT_TYPE')
    }
  })

  it('refuse un champ requis absent, vide ou du mauvais type', () => {
    for (const value of [undefined, '', '   ', 42, null, {}]) {
      const result = formFor('signup', 'start', { username: value })
      expect(result.ok, JSON.stringify(value)).toBe(false)
      if (result.ok) return
      expect(result.code).toBe('MISSING_FIELD')
      expect(result.message).toContain('username')
    }
  })

  it('ne recopie que les champs déclarés par l’étape', () => {
    const result = formFor('reset', 'submit', {
      continuation_token: 'ct',
      new_password: 'Sup3r!',
      // Ni requis ni optionnel sur cette étape : rien ne doit sortir.
      password: 'ancien',
      username: 'ada@example.test',
      redirect_uri: 'https://attacker.example',
    })
    if (!result.ok) return
    expect([...result.form.keys()].sort()).toEqual(['client_id', 'continuation_token', 'new_password'])
  })

  it('préserve les espaces d’un mot de passe et coupe ceux d’une adresse', () => {
    const result = formFor('signin', 'token', {
      continuation_token: 'ct',
      grant_type: 'password',
      password: '  espaces  ',
    })
    if (!result.ok) return
    expect(result.form.get('password')).toBe('  espaces  ')

    const started = formFor('signin', 'start', { username: '  ada@example.test  ' })
    if (!started.ok) return
    expect(started.form.get('username')).toBe('ada@example.test')
  })

  it('sérialise les attributs en chaîne JSON sans renommer les clés', () => {
    const result = formFor('signup', 'start', {
      username: 'ada@example.test',
      attributes: { givenName: 'Ada', surname: 'Lovelace' },
    })
    if (!result.ok) return
    expect(result.form.get('attributes')).toBe('{"givenName":"Ada","surname":"Lovelace"}')
  })

  it('refuse des attributs qui ne sont pas un objet', () => {
    for (const value of ['givenName=Ada', 42, ['Ada'], null]) {
      const result = formFor('signup', 'start', { username: 'ada@example.test', attributes: value })
      expect(result.ok, JSON.stringify(value)).toBe(false)
      if (result.ok) return
      expect(result.code).toBe('INVALID_ATTRIBUTES')
    }
  })

  it("ignore les attributs sur une étape qui n'en accepte pas", () => {
    const result = formFor('reset', 'start', {
      username: 'ada@example.test',
      attributes: { givenName: 'Ada' },
    })
    if (!result.ok) return
    expect(result.form.get('attributes')).toBeNull()
  })
})

describe('projectResponse', () => {
  it('conserve le couple error / suberror sans le réinterpréter', () => {
    const projected = projectResponse({
      error: 'invalid_grant',
      suberror: 'password_banned',
      error_description: 'AADSTS00000: banned password',
    })
    expect(projected['error']).toBe('invalid_grant')
    expect(projected['suberror']).toBe('password_banned')
  })

  it('conserve le jeton de continuation et les jetons émis', () => {
    const projected = projectResponse({
      continuation_token: 'ct',
      access_token: 'at',
      refresh_token: 'rt',
      id_token: 'it',
      expires_in: 3599,
      token_type: 'Bearer',
      poll_interval: 2,
      status: 'in_progress',
      challenge_target_label: 'a**@e**.test',
      code_length: 8,
    })
    expect(Object.keys(projected)).toHaveLength(10)
    expect(projected['continuation_token']).toBe('ct')
    expect(projected['poll_interval']).toBe(2)
  })

  it("laisse le libellé brut d'Entra et ses identifiants de trace hors du corps", () => {
    const projected = projectResponse({
      error: 'user_not_found',
      error_description: 'AADSTS50034: The user account {EUII Hidden} does not exist',
      error_codes: [50034],
      trace_id: 'trace',
      correlation_id: 'correlation',
      timestamp: '2026-08-27 10:27:53Z',
    })
    for (const leaked of ['error_description', 'error_codes', 'trace_id', 'correlation_id', 'timestamp']) {
      expect(projected[leaked], leaked).toBeUndefined()
    }
    expect(projected['error']).toBe('user_not_found')
  })
})

describe('hasProgress', () => {
  it("reconnaît une réponse dont le parcours peut continuer", () => {
    expect(hasProgress({ continuation_token: 'ct' })).toBe(true)
    expect(hasProgress({ access_token: 'at' })).toBe(true)
    expect(hasProgress({ status: 'succeeded' })).toBe(true)
  })

  it("traite en échec une réponse sans erreur et sans rien pour continuer", () => {
    expect(hasProgress({})).toBe(false)
    expect(hasProgress({ challenge_type: 'password' })).toBe(false)
  })
})
