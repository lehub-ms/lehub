import { HttpRequest, InvocationContext } from '@azure/functions'
import { describe, expect, it } from 'vitest'
import { accountSearch } from '../src/functions/accountSearch'
import { escapeLikePattern, SEARCH_ACCOUNTS_QUERY } from '../src/lib/accountsRepo'
import { canSearchAccounts } from '../src/lib/authz'
import { MAX_SEARCH_RESULTS, MIN_SEARCH_LENGTH } from '../src/lib/designationSchemas'
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

function search(body: unknown): HttpRequest {
  return new HttpRequest({
    method: 'POST',
    url: 'https://api.example.com/api/manage/accounts/search',
    body: { string: JSON.stringify(body) },
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

describe('habilitation de la recherche de comptes', () => {
  it('l’ouvre à un administrateur et à un organisateur, la ferme à un compte ordinaire', () => {
    expect(canSearchAccounts(ADMIN)).toBe(true)
    expect(canSearchAccounts(ORGANIZER)).toBe(true)
    // Le seul écran de LeHub qui lit le nom et l'adresse de quelqu'un d'autre. Sans cette
    // ligne, la recherche *est* l'annuaire que le backoffice refuse de publier.
    expect(canSearchAccounts(ORDINARY)).toBe(false)
  })

  it('refuse un compte ordinaire en 403, et le journalise sans son adresse', async () => {
    const ctx = context()
    const response = await accountSearch(search({ q: 'rousseau' }), ctx, session(ORDINARY))

    expect(response.status).toBe(403)
    expect((response.jsonBody as { code: string }).code).toBe('FORBIDDEN')

    const logged = JSON.stringify(ctx.errors)
    expect(logged).toContain('Authorization refused')
    expect(logged).toContain('search:accounts')
    expect(logged).toContain(IDENTITY.objectId)
    // Le journal identifie l'appelant, il ne le décrit pas.
    expect(logged).not.toContain(IDENTITY.email)
  })

  it('refuse en 403 avant de regarder le corps, valide ou non', async () => {
    // L'ordre habiliter-puis-valider : sinon le refus lui-même apprendrait à un appelant non
    // habilité à quoi ressemble une requête acceptable.
    const bad = await accountSearch(search({ q: '' }), context(), session(ORDINARY))
    const good = await accountSearch(search({ q: 'rousseau' }), context(), session(ORDINARY))

    expect(bad.status).toBe(403)
    expect(good.status).toBe(403)
  })
})

describe('validation de la requête de recherche', () => {
  it(`refuse en 400 une requête de moins de ${String(MIN_SEARCH_LENGTH)} caractères`, async () => {
    for (const q of ['', ' ', 'a', ' a ']) {
      const response = await accountSearch(search({ q }), context(), session(ADMIN))

      expect(response.status).toBe(400)
      expect((response.jsonBody as { code: string }).code).toBe('INVALID_BODY')
    }
  })

  it('refuse un corps absent, illisible ou porteur d’une clé inconnue', async () => {
    const noBody = new HttpRequest({
      method: 'POST',
      url: 'https://api.example.com/api/manage/accounts/search',
    })
    const responses = [
      await accountSearch(noBody, context(), session(ADMIN)),
      await accountSearch(search({ q: 'rousseau', limit: 500 }), context(), session(ADMIN)),
      await accountSearch(search({ query: 'rousseau' }), context(), session(ADMIN)),
    ]

    for (const response of responses) expect(response.status).toBe(400)
  })

  it('ne recopie jamais la requête reçue dans le refus ni dans la trace', async () => {
    const ctx = context()
    const response = await accountSearch(search({ q: 'a' }), ctx, session(ADMIN))

    const said = JSON.stringify(response.jsonBody) + JSON.stringify(ctx.errors)
    expect(said).toContain('too_small')
    expect(said).not.toContain('"a"')
  })

  it('laisse passer une requête recevable — au-delà, c’est la base qui répond', async () => {
    // Sans serveur SQL la suite s'arrête ici : ce qui compte est que le garde et le schéma
    // aient rendu la main, pas ce que la lecture aurait rendu.
    const response = await accountSearch(search({ q: 'ro' }), context(), session(ORGANIZER))

    expect(response.status).not.toBe(403)
    expect(response.status).not.toBe(400)
  })
})

describe('requête SQL de recherche', () => {
  it('compare sous une collation insensible aux accents', () => {
    // La collation de la base est CI_AS : « Amelie » ne trouverait pas « Amélie » sans cela.
    expect(SEARCH_ACCOUNTS_QUERY).toContain('Latin1_General_CI_AI')
    expect(SEARCH_ACCOUNTS_QUERY.match(/COLLATE Latin1_General_CI_AI/g)).toHaveLength(4)
  })

  it('cherche sur le prénom, le nom, leur concaténation et l’adresse', () => {
    expect(SEARCH_ACCOUNTS_QUERY).toContain('u.GivenName')
    expect(SEARCH_ACCOUNTS_QUERY).toContain('u.Surname')
    expect(SEARCH_ACCOUNTS_QUERY).toContain("u.GivenName + N' ' + u.Surname")
    expect(SEARCH_ACCOUNTS_QUERY).toContain('u.Email')
  })

  it('borne la lecture et fait remonter l’adresse exacte en premier', () => {
    expect(SEARCH_ACCOUNTS_QUERY).toContain('TOP (@limit)')
    expect(SEARCH_ACCOUNTS_QUERY).toContain('ORDER BY CASE WHEN u.Email = @exact THEN 0 ELSE 1 END')
  })

  it('ne rend que le prénom, le nom et l’adresse', () => {
    // #157 : « ni habilitations d'autrui, ni identifiant d'objet de l'identité, ni date de
    // connexion ». Une colonne ajoutée par mégarde se verrait ici.
    const selected = /SELECT TOP \(@limit\) (.+)\n/.exec(SEARCH_ACCOUNTS_QUERY)?.[1]

    expect(selected).toBe('u.GivenName, u.Surname, u.Email')
    expect(SEARCH_ACCOUNTS_QUERY).not.toContain('ExternalIdObjectId')
    expect(SEARCH_ACCOUNTS_QUERY).not.toContain('LastLoginAt')
    expect(SEARCH_ACCOUNTS_QUERY).not.toContain('IsGlobalAdmin')
  })

  it('échappe les caractères que LIKE traite comme de la syntaxe', () => {
    // Sans quoi une recherche sur « % » ramènerait tout l'annuaire.
    expect(SEARCH_ACCOUNTS_QUERY).toContain("ESCAPE '\\'")
    expect(escapeLikePattern('100%')).toBe('100\\%')
    expect(escapeLikePattern('a_b')).toBe('a\\_b')
    expect(escapeLikePattern('[ab]')).toBe('\\[ab]')
    // La barre inverse d'abord, sinon elle échapperait les échappements qu'on vient de poser.
    expect(escapeLikePattern('a\\%')).toBe('a\\\\\\%')
    expect(escapeLikePattern('rousseau')).toBe('rousseau')
  })

  it('lit un enregistrement de plus qu’il n’en rend, pour signaler le dépassement', () => {
    // C'est ce rang excédentaire qui devient `truncated`, plutôt qu'un COUNT(*) supplémentaire.
    expect(MAX_SEARCH_RESULTS).toBe(20)
  })
})
