import { HttpRequest, InvocationContext } from '@azure/functions'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { guidParam, parseBody } from '../src/lib/validation'

const SCHEMA = z.strictObject({
  name: z.string().trim().min(1).max(10),
  count: z.number().int().optional(),
})

function request(body: unknown, params: Record<string, string> = {}): HttpRequest {
  return new HttpRequest({
    method: 'POST',
    url: 'https://api.example.com/api/admin/communities',
    params,
    body: { string: typeof body === 'string' ? body : JSON.stringify(body) },
    headers: { 'content-type': 'application/json' },
  })
}

/** Capture les appels à context.error sans dépendre du hôte Functions. */
function context(): InvocationContext & { errors: unknown[][] } {
  const errors: unknown[][] = []
  const ctx = new InvocationContext({ functionName: 'test' }) as InvocationContext & {
    errors: unknown[][]
  }
  ctx.error = (...args: unknown[]) => void errors.push(args)
  ctx.errors = errors
  return ctx
}

/** Le corps JSON de la réponse, tel qu'un client le recevrait. */
function body(response: { jsonBody?: unknown }): Record<string, unknown> {
  return response.jsonBody as Record<string, unknown>
}

describe('parseBody', () => {
  it('rend la valeur analysée quand le corps est conforme', async () => {
    const result = await parseBody(request({ name: '  Azure  ', count: 3 }), context(), SCHEMA)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    // Rognée par le schéma : c'est la valeur analysée qui circule, pas celle reçue.
    expect(result.value).toEqual({ name: 'Azure', count: 3 })
  })

  it('refuse un champ manquant en 400 INVALID_BODY', async () => {
    const result = await parseBody(request({ count: 3 }), context(), SCHEMA)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.response.status).toBe(400)
    expect(body(result.response)['code']).toBe('INVALID_BODY')
  })

  it('refuse un type faux', async () => {
    const result = await parseBody(request({ name: 42 }), context(), SCHEMA)

    expect(result.ok).toBe(false)
  })

  it('refuse une clé inconnue plutôt que de l’ignorer', async () => {
    const ctx = context()
    const result = await parseBody(request({ name: 'Azure', nope: 1 }), ctx, SCHEMA)

    expect(result.ok).toBe(false)
    expect(JSON.stringify(ctx.errors)).toContain('unrecognized_keys')
  })

  it('refuse un corps qui n’est pas du JSON, sans erreur serveur', async () => {
    const ctx = context()
    const result = await parseBody(request('{ pas du json'), ctx, SCHEMA)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.response.status).toBe(400)
    expect(JSON.stringify(ctx.errors)).toContain('invalid_json')
  })

  it('refuse un corps vide', async () => {
    const result = await parseBody(request(''), context(), SCHEMA)

    expect(result.ok).toBe(false)
  })

  // La propriété qui compte : le refus est une porte fermée, pas un miroir.
  it('ne recopie jamais la valeur reçue dans la réponse, et journalise chemin et code', async () => {
    const secret = 'MotDePasseTresSecret123'
    const ctx = context()
    const result = await parseBody(request({ name: secret }), ctx, SCHEMA)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')

    const answered = JSON.stringify(result.response)
    expect(answered).not.toContain(secret)
    expect(body(result.response)['message']).toBe(
      'The request body does not match the expected shape.',
    )

    // La trace porte de quoi diagnostiquer — et rien de plus.
    const logged = JSON.stringify(ctx.errors)
    expect(logged).toContain('Body validation refused')
    expect(logged).toContain('"path":"name"')
    expect(logged).toContain('too_big')
    expect(logged).not.toContain(secret)
  })
})

describe('guidParam', () => {
  it('accepte un identifiant du référentiel, dont la forme n’est pas celle d’un UUID RFC 4122', () => {
    // Le nibble de version vaut 0 : z.uuid() le refuserait, et 400 sur chaque communauté semée.
    const seeded = 'C1C1C1C1-0000-0000-0000-000000000001'
    const result = guidParam(request({}, { communityId: seeded }), context(), 'communityId')

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.value).toBe(seeded)
  })

  it('accepte les deux casses, comme la résolution côté serveur', () => {
    const lower = guidParam(
      request({}, { communityId: 'c1c1c1c1-0000-0000-0000-000000000001' }),
      context(),
      'communityId',
    )

    expect(lower.ok).toBe(true)
  })

  it('refuse un identifiant malformé en 400 INVALID_ROUTE_PARAMETER, avant toute requête', () => {
    const ctx = context()
    const result = guidParam(request({}, { communityId: 'azure-user-group' }), ctx, 'communityId')

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.response.status).toBe(400)
    expect(body(result.response)['code']).toBe('INVALID_ROUTE_PARAMETER')
    // Le nom du paramètre suffit à diagnostiquer ; la valeur est déjà dans le chemin journalisé.
    expect(JSON.stringify(ctx.errors)).toContain('"parameter":"communityId"')
  })

  it('refuse un paramètre absent', () => {
    const result = guidParam(request({}), context(), 'communityId')

    expect(result.ok).toBe(false)
  })
})
