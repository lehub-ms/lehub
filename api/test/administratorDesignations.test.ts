import { HttpRequest, InvocationContext } from '@azure/functions'
import { describe, expect, it } from 'vitest'
import { administrators } from '../src/functions/administrators'
import {
  GRANT_GLOBAL_ADMIN_QUERY,
  LIST_GLOBAL_ADMINS_QUERY,
  REVOKE_GLOBAL_ADMIN_QUERY,
} from '../src/lib/administratorsRepo'
import { canManageGlobalAdmins } from '../src/lib/authz'
import { type SessionPermissions } from '../src/lib/permissionsRepo'
import { type AuthenticatedIdentity } from '../src/lib/tokenValidation'
import { type AuthenticatedSession } from '../src/lib/withAuthorization'

const IDENTITY: AuthenticatedIdentity = {
  objectId: 'c722f670-cebf-4f94-b3b2-1723bfa372e6',
  email: 'organisateur@example.com',
  givenName: 'Amélie',
  familyName: 'Rousseau',
}

const ADMIN: SessionPermissions = { isGlobalAdmin: true, organizedCommunityIds: [] }
const ORGANIZER: SessionPermissions = {
  isGlobalAdmin: false,
  organizedCommunityIds: ['C1C1C1C1-0000-0000-0000-000000000001'],
}
const ORDINARY: SessionPermissions = { isGlobalAdmin: false, organizedCommunityIds: [] }

function session(permissions: SessionPermissions): AuthenticatedSession {
  return { identity: IDENTITY, permissions }
}

function call(method: string, body?: unknown): HttpRequest {
  return new HttpRequest({
    method,
    url: 'https://api.example.com/api/manage/administrators',
    ...(body === undefined
      ? {}
      : {
          body: { string: JSON.stringify(body) },
          headers: { 'content-type': 'application/json' },
        }),
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

describe('habilitation des administrateurs globaux', () => {
  it('la réserve aux administrateurs, organisateurs compris dans le refus', () => {
    // Personne ne s'octroie cette qualité, et aucun organisateur ne la donne : c'est la seule
    // habilitation que la cooptation ne touche pas.
    expect(canManageGlobalAdmins(ADMIN)).toBe(true)
    expect(canManageGlobalAdmins(ORGANIZER)).toBe(false)
    expect(canManageGlobalAdmins(ORDINARY)).toBe(false)
  })

  for (const [verb, body, action] of [
    ['GET', undefined, 'read:global-admins'],
    ['POST', { email: 'renfort@lehub.invalid' }, 'grant:global-admin'],
    ['DELETE', { email: 'renfort@lehub.invalid' }, 'revoke:global-admin'],
  ] as const) {
    it(`refuse ${verb} à un organisateur, en 403 journalisé`, async () => {
      // Requête forgée : l'écran n'est même pas monté pour lui (RequireGlobalAdmin), et c'est
      // précisément ce que ce test démontre — l'interface n'a jamais protégé quoi que ce soit.
      const ctx = context()
      const response = await administrators(call(verb, body), ctx, session(ORGANIZER))

      expect(response.status).toBe(403)
      expect((response.jsonBody as { code: string }).code).toBe('FORBIDDEN')

      const logged = JSON.stringify(ctx.errors)
      expect(logged).toContain('Authorization refused')
      expect(logged).toContain(action)
      expect(logged).toContain(IDENTITY.objectId)
      // Le journal identifie l'appelant, il ne le décrit pas.
      expect(logged).not.toContain(IDENTITY.email)
    })
  }

  it('refuse avant de regarder le corps, valide ou non', async () => {
    const bad = await administrators(
      call('POST', { email: 'pas une adresse' }),
      context(),
      session(ORGANIZER),
    )
    const good = await administrators(
      call('POST', { email: 'renfort@lehub.invalid' }),
      context(),
      session(ORGANIZER),
    )

    expect(bad.status).toBe(403)
    expect(good.status).toBe(403)
  })
})

describe('validation du corps', () => {
  for (const body of [{}, { email: '' }, { email: 'pas une adresse' }, { email: 'a@b.fr', x: 1 }]) {
    it(`refuse ${JSON.stringify(body)} en 400`, async () => {
      const response = await administrators(call('POST', body), context(), session(ADMIN))

      expect(response.status).toBe(400)
      expect((response.jsonBody as { code: string }).code).toBe('INVALID_BODY')
    })
  }

  it('laisse passer un administrateur — au-delà, c’est la base qui répond', async () => {
    const response = await administrators(
      call('POST', { email: 'renfort@lehub.invalid' }),
      context(),
      session(ADMIN),
    )

    expect(response.status).not.toBe(403)
    expect(response.status).not.toBe(400)
  })
})

describe('requêtes SQL du marqueur d’administrateur', () => {
  it('ne lit que le prénom, le nom et l’adresse des administrateurs', () => {
    expect(LIST_GLOBAL_ADMINS_QUERY).toContain('u.GivenName, u.Surname, u.Email')
    expect(LIST_GLOBAL_ADMINS_QUERY).toContain('u.IsGlobalAdmin = 1')
    expect(LIST_GLOBAL_ADMINS_QUERY).not.toContain('ExternalIdObjectId')
  })

  it('ne touche jamais à AdminBootstrap', () => {
    // C'est l'edge case du rejeu (#106/#159) : cette table porte l'intention du *seed*, et son
    // AppliedAt est ce qui empêche un administrateur retiré ici d'être repromu au prochain
    // rejeu. Y inscrire une promotion du backoffice ressusciterait le défaut que 0004 a écarté.
    expect(GRANT_GLOBAL_ADMIN_QUERY).not.toContain('AdminBootstrap')
    expect(REVOKE_GLOBAL_ADMIN_QUERY).not.toContain('AdminBootstrap')
  })

  it('promeut de façon idempotente et distingue « déjà administrateur » du compte inconnu', () => {
    expect(GRANT_GLOBAL_ADMIN_QUERY).toContain('WHERE Email = @email AND IsGlobalAdmin = 0')
    expect(GRANT_GLOBAL_ADMIN_QUERY).toContain("'already-admin'")
    expect(GRANT_GLOBAL_ADMIN_QUERY).toContain("'account-not-found'")
  })

  it('capture @@ROWCOUNT avant le premier SELECT, dans les deux écritures', () => {
    // Toute instruction le réinitialise : un SELECT intercalé ferait passer chaque écriture
    // pour un succès.
    for (const query of [GRANT_GLOBAL_ADMIN_QUERY, REVOKE_GLOBAL_ADMIN_QUERY]) {
      const rowCount = query.indexOf('@@ROWCOUNT')
      const firstSelect = query.indexOf('\nSELECT')

      expect(rowCount).toBeGreaterThan(-1)
      expect(rowCount).toBeLessThan(firstSelect)
    }
  })

  it('refuse le retrait du dernier administrateur, sous verrou', () => {
    // `> 1` seul laisserait deux retraits concurrents lire 2 chacun et passer tous les deux ;
    // UPDLOCK sérialise la lecture du compte et HOLDLOCK en tient l'étendue jusqu'au bout.
    expect(REVOKE_GLOBAL_ADMIN_QUERY).toContain('WITH (UPDLOCK, HOLDLOCK)')
    expect(REVOKE_GLOBAL_ADMIN_QUERY).toContain('WHERE IsGlobalAdmin = 1) > 1')
    expect(REVOKE_GLOBAL_ADMIN_QUERY).toContain("'last-admin'")
  })

  it('ne fait aucun cas de l’auto-retrait', () => {
    // Se retirer soi-même est permis si l'on n'est pas le dernier : un appelant est un
    // administrateur comme un autre, et l'interface se charge de l'annoncer.
    expect(REVOKE_GLOBAL_ADMIN_QUERY).not.toContain('@objectId')
    expect(REVOKE_GLOBAL_ADMIN_QUERY).not.toContain('@caller')
  })
})
