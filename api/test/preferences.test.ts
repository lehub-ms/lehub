import { HttpRequest, InvocationContext } from '@azure/functions'
import { describe, expect, it } from 'vitest'
import { mePreferences } from '../src/functions/mePreferences'
import { PURGE_COMMUNITY_PREFERENCES } from '../src/lib/communitiesRepo'
import { SAVE_PREFERENCES } from '../src/lib/preferenceSchemas'
import {
  DELETE_PREFERENCES_QUERY,
  READ_PREFERENCES_QUERY,
  REPLACE_PREFERENCES_QUERY,
} from '../src/lib/preferencesRepo'
import { PURGE_TECHNOLOGY_PREFERENCES } from '../src/lib/technologiesRepo'
import { type AuthenticatedIdentity } from '../src/lib/tokenValidation'

const IDENTITY: AuthenticatedIdentity = {
  objectId: 'c722f670-cebf-4f94-b3b2-1723bfa372e6',
  email: 'membre@example.com',
  givenName: 'Amélie',
  familyName: 'Rousseau',
}

function call(method: 'GET' | 'PUT' | 'DELETE', body?: unknown): HttpRequest {
  return new HttpRequest({
    method,
    url: 'https://api.example.com/api/me/preferences',
    ...(body === undefined
      ? {}
      : { body: { string: JSON.stringify(body) }, headers: { 'content-type': 'application/json' } }),
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

function code(response: { jsonBody?: unknown }): string {
  return (response.jsonBody as { code: string }).code
}

/**
 * Le jeton porte l'existence des préférences, et ces assertions portent sur le texte SQL parce
 * que c'est là que l'invariant vit — pas dans une branche TypeScript qu'on pourrait contourner.
 * Aucune base n'est nécessaire pour les lire, exactement comme pour `organizersRepo`.
 */
describe('invariant du jeton de calendrier', () => {
  it('ne frappe le jeton qu’au premier enregistrement', () => {
    // `COALESCE` est *la* raison pour laquelle « aucun réabonnement nécessaire » est vrai. Un
    // `SET CalendarToken = NEWID()` nu régénérerait le jeton à chaque mise à jour et couperait
    // les agendas déjà abonnés, sans que rien dans l'interface ne le montre.
    expect(REPLACE_PREFERENCES_QUERY).toContain('CalendarToken = COALESCE(CalendarToken, NEWID())')
    expect(REPLACE_PREFERENCES_QUERY).not.toMatch(/CalendarToken\s*=\s*NEWID\(\)/)
  })

  it('rend le jeton à la suppression', () => {
    // Garder le jeton sans sélection dirait qu'il y a encore quelque chose à diffuser.
    expect(DELETE_PREFERENCES_QUERY).toContain('CalendarToken = NULL')
  })

  it('ne touche pas au jeton en lecture', () => {
    expect(READ_PREFERENCES_QUERY).not.toMatch(/UPDATE|INSERT|DELETE/)
  })

  it('lit le jeton plutôt que de le déduire des lignes', () => {
    // Deux tables vides ne disent pas si la sélection enregistrée est vide ou s'il n'y a aucune
    // préférence. Sans cette lecture, la distinction que toute l'interface oppose n'existe pas.
    expect(READ_PREFERENCES_QUERY).toContain('SELECT CalendarToken FROM dbo.[User]')
  })
})

describe('isolation entre comptes', () => {
  // Le compte de la session et aucun autre. La route ne porte pas d'identifiant, donc le seul
  // risque serait une requête qui oublie sa clause : elles sont énumérées ici plutôt que
  // relues à la main.
  for (const [name, query] of [
    ['lecture', READ_PREFERENCES_QUERY],
    ['remplacement', REPLACE_PREFERENCES_QUERY],
    ['suppression', DELETE_PREFERENCES_QUERY],
  ] as const) {
    it(`n’opère que sur @objectId — ${name}`, () => {
      const statements = query
        .split(';')
        .filter((statement) => /dbo\.UserPreferred(Community|Technology)/.test(statement))

      expect(statements.length).toBeGreaterThan(0)
      for (const statement of statements) {
        // Le compte se porte en `WHERE UserObjectId = @objectId` sur les lectures et les
        // suppressions, et en colonne insérée sur les INSERT. Ce qu'on refuse ici est
        // l'instruction qui ne le mentionne pas du tout : celle-là vaudrait pour tout le monde.
        expect(statement).toContain('@objectId')
      }
    })
  }
})

describe('remplacement intégral de la sélection', () => {
  it('remplace les deux dimensions dans une seule transaction', () => {
    // Deux onglets qui enregistrent en même temps : la dernière écriture gagne, et aucun lecteur
    // ne voit l'ensemble à moitié remplacé. C'est la transaction qui le garantit, pas l'ordre
    // des instructions.
    expect(REPLACE_PREFERENCES_QUERY).toContain('SET XACT_ABORT ON')

    const transaction = REPLACE_PREFERENCES_QUERY.slice(
      REPLACE_PREFERENCES_QUERY.indexOf('BEGIN TRANSACTION'),
      REPLACE_PREFERENCES_QUERY.indexOf('COMMIT TRANSACTION'),
    )

    expect(transaction).toContain('DELETE FROM dbo.UserPreferredCommunity')
    expect(transaction).toContain('DELETE FROM dbo.UserPreferredTechnology')
    expect(transaction).toContain('INSERT INTO dbo.UserPreferredCommunity')
    expect(transaction).toContain('INSERT INTO dbo.UserPreferredTechnology')
    expect(transaction).toContain('CalendarToken')
  })

  it('refuse une entrée inconnue ou archivée avant d’écrire quoi que ce soit', () => {
    // La validation est dans le lot, avant le `BEGIN TRANSACTION` : rien n'est écrit puis
    // défait, donc « sans écriture partielle » ne dépend pas du rollback.
    const guard = REPLACE_PREFERENCES_QUERY.slice(
      0,
      REPLACE_PREFERENCES_QUERY.indexOf('BEGIN TRANSACTION'),
    )

    expect(guard).toContain("c.Status = 'active'")
    expect(guard).toContain("t.Status = 'active'")
    expect(guard).toContain("'unknown-reference' AS Outcome")
  })

  it('accepte une entrée archivée que le compte suivait déjà', () => {
    // Sinon l'impasse : #195 affiche l'entrée archivée pas encore purgée, elle revient donc à
    // chaque lecture, et un refus rendrait *tout* enregistrement ultérieur impossible tant que
    // l'utilisateur n'aurait pas tout réinitialisé. La garde ne vise que ce qu'on vient de
    // cocher alors que ça venait de disparaître.
    const guard = REPLACE_PREFERENCES_QUERY.slice(
      0,
      REPLACE_PREFERENCES_QUERY.indexOf('BEGIN TRANSACTION'),
    )

    expect(guard).toContain('FROM dbo.UserPreferredCommunity AS p')
    expect(guard).toContain('FROM dbo.UserPreferredTechnology AS p')
    expect(guard).toMatch(/p\.UserObjectId = @objectId AND p\.CommunityId = s\.Id/)
    expect(guard).toMatch(/p\.UserObjectId = @objectId AND p\.TechnologyId = s\.Id/)
  })

  it('referme XACT_ABORT après le commit, sur les deux écritures', () => {
    // C'est un réglage de *connexion*, et la connexion est mutualisée : laissé actif, il suit le
    // pool dans toutes les requêtes suivantes. `eventsRepo` a établi la convention.
    for (const query of [REPLACE_PREFERENCES_QUERY, DELETE_PREFERENCES_QUERY]) {
      expect(query.indexOf('SET XACT_ABORT OFF')).toBeGreaterThan(query.indexOf('COMMIT TRANSACTION'))
    }
  })

  it('refuse un compte sans ligne miroir plutôt que d’enregistrer dans le vide', () => {
    // Sélection vide + compte absent : aucune clé étrangère ne serait violée, et
    // l'enregistrement n'enregistrerait rien tout en répondant que tout va bien.
    expect(REPLACE_PREFERENCES_QUERY).toContain("'account-not-found' AS Outcome")
  })

  it('dédoublonne la sélection soumise', () => {
    // La clé composite refuserait le doublon par une violation d'unicité, donc un 500. Le
    // DISTINCT en fait un non-évènement, ce qu'il est : cocher deux fois la même entrée n'est
    // pas une erreur de l'utilisateur.
    expect(REPLACE_PREFERENCES_QUERY).toMatch(/INSERT INTO @submittedCommunities[\s\S]*?DISTINCT/)
    expect(REPLACE_PREFERENCES_QUERY).toMatch(/INSERT INTO @submittedTechnologies[\s\S]*?DISTINCT/)
  })
})

describe('lecture des entrées archivées', () => {
  it('ne filtre pas la sélection enregistrée sur le statut', () => {
    // Une entrée archivée pas encore purgée reste affichée (#195) plutôt que de laisser un trou
    // silencieux, et la barre doit pouvoir la nommer si elle quitte la sélection (#193).
    expect(READ_PREFERENCES_QUERY).not.toMatch(/Status\s*=\s*'active'/)
    expect(READ_PREFERENCES_QUERY).toContain("CASE WHEN c.Status = 'archived' THEN 1 ELSE 0 END")
    expect(READ_PREFERENCES_QUERY).toContain("CASE WHEN t.Status = 'archived' THEN 1 ELSE 0 END")
  })
})

describe('purge des préférences à l’archivage', () => {
  // Écrit ici et non dans `referenceWrites.test.ts` : c'est un invariant de #191 — une préférence
  // ne survit pas à ce que l'utilisateur ne peut plus ni voir ni retirer — que le référentiel se
  // contente d'appliquer.
  for (const [dimension, fragment, table] of [
    ['communauté', PURGE_COMMUNITY_PREFERENCES, 'dbo.UserPreferredCommunity'],
    ['technologie', PURGE_TECHNOLOGY_PREFERENCES, 'dbo.UserPreferredTechnology'],
  ] as const) {
    it(`retire l’entrée des préférences de tous les comptes — ${dimension}`, () => {
      expect(fragment).toContain(`DELETE FROM ${table}`)
      // Aucune clause de compte : la purge vaut pour tout le monde, c'est le référentiel qui
      // bouge, pas une préférence individuelle.
      expect(fragment).not.toContain('UserObjectId')
    })

    it(`ne supprime rien tant que l’entrée n’est pas archivée — ${dimension}`, () => {
      // Le fragment est posé sur *chaque* écriture du référentiel : sans cette garde, renommer
      // une technologie effacerait les préférences de tous ceux qui la suivent.
      expect(fragment).toContain("Status = 'archived'")
    })
  }
})

describe('schéma d’enregistrement', () => {
  it('accepte une sélection vide, qui vaut « tous les évènements »', () => {
    const parsed = SAVE_PREFERENCES.safeParse({ communityIds: [], technologyIds: [] })

    expect(parsed.success).toBe(true)
  })

  it('accepte un corps vide et le complète en sélection vide', () => {
    const parsed = SAVE_PREFERENCES.safeParse({})

    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual({ communityIds: [], technologyIds: [] })
  })

  it('refuse un identifiant qui n’en est pas un', () => {
    expect(SAVE_PREFERENCES.safeParse({ communityIds: ['pas-un-guid'] }).success).toBe(false)
  })
})

describe('refus au niveau de la route', () => {
  it('refuse un corps prétendant écrire sur un autre compte', async () => {
    // Le seul identifiant que la route utilise vient du jeton. `strictObject` fait de la
    // tentative un refus lisible plutôt qu'une clé silencieusement ignorée.
    const ctx = context()
    const response = await mePreferences(
      call('PUT', { communityIds: [], technologyIds: [], objectId: 'a-quelqu-un-d-autre' }),
      ctx,
      IDENTITY,
    )

    expect(response.status).toBe(400)
    expect(code(response)).toBe('INVALID_BODY')
    expect(ctx.errors).toHaveLength(1)
  })

  it('refuse un corps illisible', async () => {
    const request = new HttpRequest({
      method: 'PUT',
      url: 'https://api.example.com/api/me/preferences',
      body: { string: 'pas du JSON' },
      headers: { 'content-type': 'application/json' },
    })

    const response = await mePreferences(request, context(), IDENTITY)

    expect(response.status).toBe(400)
    expect(code(response)).toBe('INVALID_BODY')
  })

  it('refuse une sélection portant un identifiant malformé', async () => {
    const response = await mePreferences(
      call('PUT', { communityIds: ['1'], technologyIds: [] }),
      context(),
      IDENTITY,
    )

    expect(response.status).toBe(400)
    expect(code(response)).toBe('INVALID_BODY')
  })
})
