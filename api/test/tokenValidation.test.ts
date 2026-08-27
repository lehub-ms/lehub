import { SignJWT, generateKeyPair, type JWTVerifyGetKey } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildEntraConfig, type EntraConfig } from '../src/lib/entraConfig'
import { bearerToken, verifyAccessToken } from '../src/lib/tokenValidation'

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

// Tokens are forged here against a key pair generated in-process. A test that reached a real
// tenant would need a real account and a network, and would stop running in CI.
//
// The key type is read off `generateKeyPair` rather than named: `CryptoKey` is a global the
// test tsconfig does not carry, and deriving it keeps the fixture honest if jose changes it.
type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey']

let signingKey: SigningKey
let keys: JWTVerifyGetKey
let otherSigningKey: SigningKey

const now = () => Math.floor(Date.now() / 1000)

interface Overrides {
  issuer?: string
  audience?: string
  expiresAt?: number
  claims?: Record<string, unknown>
  key?: SigningKey
}

async function forge(overrides: Overrides = {}): Promise<string> {
  return new SignJWT({
    oid: '3f1b0c8e-1111-2222-3333-444455556666',
    email: 'ada@example.test',
    given_name: 'Ada',
    family_name: 'Lovelace',
    ...overrides.claims,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setIssuer(overrides.issuer ?? CONFIG.issuer)
    .setAudience(overrides.audience ?? CONFIG.clientId)
    .setExpirationTime(overrides.expiresAt ?? now() + 3600)
    .sign(overrides.key ?? signingKey)
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  const other = await generateKeyPair('RS256')
  signingKey = pair.privateKey
  otherSigningKey = other.privateKey
  keys = async () => pair.publicKey
})

describe('verifyAccessToken', () => {
  it('accepte un jeton signé, émis et destiné au bon endroit, et en tire l’identité', async () => {
    const result = await verifyAccessToken(await forge(), CONFIG, keys)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.identity).toEqual({
      objectId: '3f1b0c8e-1111-2222-3333-444455556666',
      email: 'ada@example.test',
      givenName: 'Ada',
      familyName: 'Lovelace',
    })
  })

  it('refuse une signature faite avec une autre clé', async () => {
    const result = await verifyAccessToken(await forge({ key: otherSigningKey }), CONFIG, keys)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.refusal.reason).toBe('invalid')
  })

  it('refuse un jeton non signé, alg none', async () => {
    // Fabriqué à la main : jose refuse de *signer* en `none`, mais un attaquant, lui, ne
    // passe pas par jose. C'est la vérification de signature qui doit tenir.
    const b64 = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString('base64url')
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
      oid: '3f1b0c8e-1111-2222-3333-444455556666',
      iss: CONFIG.issuer,
      aud: CONFIG.clientId,
      exp: now() + 3600,
    })}.`
    const result = await verifyAccessToken(unsigned, CONFIG, keys)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.refusal.reason).toBe('invalid')
  })

  it('refuse un autre émetteur, y compris un émetteur crédible', async () => {
    const issuers = [
      `https://login.microsoftonline.com/${TENANT}/v2.0`,
      `https://${TENANT}.ciamlogin.com/${TENANT}/v1.0`,
      'https://lehubextiddev.ciamlogin.com/lehubextiddev.onmicrosoft.com/v2.0',
    ]
    for (const issuer of issuers) {
      const result = await verifyAccessToken(await forge({ issuer }), CONFIG, keys)
      expect(result.ok, issuer).toBe(false)
      if (result.ok) return
      expect(result.refusal.reason).toBe('invalid')
    }
  })

  it("refuse une audience étrangère, jusqu'à l'URI d'application du même tenant", async () => {
    // `api://lehub-api` est l'identifierUri de cette même inscription, et il n'est pourtant
    // pas l'audience attendue : requestedAccessTokenVersion vaut 2, donc l'audience est le
    // GUID. Accepter les deux serait accepter un jeton émis pour autre chose.
    for (const audience of ['api://lehub-api', '00000003-0000-0000-c000-000000000000', 'lehub']) {
      const result = await verifyAccessToken(await forge({ audience }), CONFIG, keys)
      expect(result.ok, audience).toBe(false)
      if (result.ok) return
      expect(result.refusal.reason).toBe('invalid')
    }
  })

  it('refuse un jeton expiré, et le distingue d’un jeton invalide', async () => {
    const result = await verifyAccessToken(await forge({ expiresAt: now() - 3600 }), CONFIG, keys)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.refusal.reason).toBe('expired')
  })

  it('tolère une horloge décalée de quelques secondes, pas de quelques minutes', async () => {
    const inTolerance = await verifyAccessToken(await forge({ expiresAt: now() - 30 }), CONFIG, keys)
    expect(inTolerance.ok).toBe(true)

    const outOfTolerance = await verifyAccessToken(await forge({ expiresAt: now() - 300 }), CONFIG, keys)
    expect(outOfTolerance.ok).toBe(false)
    if (outOfTolerance.ok) return
    expect(outOfTolerance.refusal.reason).toBe('expired')
  })

  it("refuse un jeton sans oid : il n'y a pas d'identité à en tirer", async () => {
    for (const oid of [undefined, '', '   ', 42]) {
      const result = await verifyAccessToken(await forge({ claims: { oid } }), CONFIG, keys)
      expect(result.ok, JSON.stringify(oid)).toBe(false)
      if (result.ok) return
      expect(result.refusal.reason).toBe('invalid')
    }
  })

  it('traite un claim de nom absent comme absent, sans jamais le fabriquer', async () => {
    const result = await verifyAccessToken(
      await forge({ claims: { given_name: undefined, family_name: '  ', email: undefined } }),
      CONFIG,
      keys,
    )
    if (!result.ok) return
    expect(result.identity.givenName).toBeNull()
    expect(result.identity.familyName).toBeNull()
    expect(result.identity.email).toBeNull()
    expect(result.identity.objectId).toBe('3f1b0c8e-1111-2222-3333-444455556666')
  })

  it("traite un jeu de clés injoignable en faute serveur, jamais en acceptation", async () => {
    const failing: JWTVerifyGetKey = async () => {
      const error = new Error('Timeout reached') as Error & { code: string }
      error.code = 'ERR_JWKS_TIMEOUT'
      throw error
    }
    const result = await verifyAccessToken(await forge(), CONFIG, failing)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.refusal.reason).toBe('jwks-unavailable')
  })

  it("refuse plutôt qu'accepter face à une erreur qu'il ne sait pas classer", async () => {
    const exploding: JWTVerifyGetKey = async () => {
      throw new Error('something nobody anticipated')
    }
    const result = await verifyAccessToken(await forge(), CONFIG, exploding)
    expect(result.ok).toBe(false)
  })
})

describe('bearerToken', () => {
  it('lit le jeton quel que soit la casse du schéma', () => {
    for (const header of ['Bearer abc.def.ghi', 'bearer abc.def.ghi', 'BEARER  abc.def.ghi', '  Bearer abc.def.ghi  ']) {
      expect(bearerToken(header), header).toBe('abc.def.ghi')
    }
  })

  it("traite un en-tête sans schéma Bearer comme un jeton absent", () => {
    for (const header of [null, undefined, '', '   ', 'abc.def.ghi', 'Basic dXNlcjpwYXNz', 'Bearer', 'Bearer   ']) {
      expect(bearerToken(header), String(header)).toBeNull()
    }
  })
})
