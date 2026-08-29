import { HttpRequest, InvocationContext } from '@azure/functions'
import { describe, expect, it } from 'vitest'
import { authorized, type AuthenticatedSession } from '../src/lib/withAuthorization'
import { type SessionPermissions } from '../src/lib/permissionsRepo'
import { type AuthenticatedIdentity } from '../src/lib/tokenValidation'

const IDENTITY: AuthenticatedIdentity = {
  objectId: 'c722f670-cebf-4f94-b3b2-1723bfa372e6',
  email: 'organisateur@example.com',
  givenName: 'Amélie',
  familyName: 'Rousseau',
}

function request(): HttpRequest {
  return new HttpRequest({ method: 'POST', url: 'https://api.example.com/api/communities/c1/organizers' })
}

/** Capture les appels à context.error sans dépendre du hôte Functions. */
function context(): InvocationContext & { errors: unknown[][] } {
  const errors: unknown[][] = []
  const ctx = new InvocationContext({ functionName: 'test' }) as InvocationContext & { errors: unknown[][] }
  ctx.error = (...args: unknown[]) => void errors.push(args)
  ctx.errors = errors
  return ctx
}

describe('authorized', () => {
  it('attache les habilitations résolues à la session du handler', async () => {
    const permissions: SessionPermissions = { isGlobalAdmin: false, organizedCommunityIds: ['c1'] }
    let seen: AuthenticatedSession | null = null

    const handler = authorized(
      async (_req, _ctx, session) => {
        seen = session
        return { status: 204 }
      },
      async () => permissions,
    )

    const response = await handler(request(), context(), IDENTITY)

    expect(response.status).toBe(204)
    expect(seen).toEqual({ identity: IDENTITY, permissions })
  })

  it("résout à partir de l'identifiant d'objet du jeton validé, et de rien d'autre", async () => {
    const asked: string[] = []
    const handler = authorized(
      async () => ({ status: 204 }),
      async (objectId) => {
        asked.push(objectId)
        return { isGlobalAdmin: false, organizedCommunityIds: [] }
      },
    )

    await handler(request(), context(), IDENTITY)

    expect(asked).toEqual([IDENTITY.objectId])
  })

  it('résout une seule fois par requête', async () => {
    let calls = 0
    const handler = authorized(
      async () => ({ status: 204 }),
      async () => {
        calls += 1
        return { isGlobalAdmin: true, organizedCommunityIds: [] }
      },
    )

    await handler(request(), context(), IDENTITY)

    expect(calls).toBe(1)
  })

  it('répond 500 sur une base indisponible, jamais des habilitations par défaut', async () => {
    let handlerRan = false
    const handler = authorized(
      async () => {
        handlerRan = true
        return { status: 204 }
      },
      async () => {
        throw new Error('connection refused')
      },
    )

    const ctx = context()
    const response = await handler(request(), ctx, IDENTITY)

    // Des habilitations vides transformeraient une panne en refus d'autorisation général,
    // que le client lirait comme « vous n'avez pas le droit » et non « on n'a pas pu savoir ».
    expect(response.status).toBe(500)
    expect(response.jsonBody).toEqual({
      code: 'PERMISSIONS_UNAVAILABLE',
      message: 'Unable to resolve the session permissions.',
    })
    expect(handlerRan).toBe(false)
    expect(ctx.errors).toHaveLength(1)
  })

  it('journalise le refus de résolution sans jeton ni claim', async () => {
    const ctx = context()
    const handler = authorized(
      async () => ({ status: 204 }),
      async () => {
        throw new Error('connection refused')
      },
    )

    await handler(request(), ctx, IDENTITY)

    const logged = JSON.stringify(ctx.errors)
    expect(logged).toContain(IDENTITY.objectId)
    // L'identifiant d'objet suffit à retrouver l'appelant ; l'adresse et le nom sont des
    // claims, et un journal n'en a pas besoin.
    expect(logged).not.toContain(IDENTITY.email)
    expect(logged).not.toContain(IDENTITY.givenName)
    expect(logged).not.toContain('Bearer')
  })
})
