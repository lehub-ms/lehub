import { describe, expect, it } from 'vitest'
import {
  buildEntraConfig,
  describeEntraConfigError,
  isEntraConfigured,
} from '../src/lib/entraConfig'

// The dev tenant's real identifiers. None of them is a secret — they are the tenant
// subdomain, the directory ID and the application ID, and they live in the committed
// infra/main.dev.bicepparam for exactly that reason.
const TENANT = 'f5850776-0bc8-402e-85e9-1d8713d64ddb'
const CLIENT = '0ba42dc6-26d6-448c-b235-8ef540730c7e'

const DEV: NodeJS.ProcessEnv = {
  ENTRA_TENANT_ID: TENANT,
  ENTRA_CLIENT_ID: CLIENT,
  ENTRA_AUTHORITY: `https://lehubextiddev.ciamlogin.com/${TENANT}/v2.0`,
  ENTRA_ISSUER: `https://${TENANT}.ciamlogin.com/${TENANT}/v2.0`,
}

describe('buildEntraConfig', () => {
  it('accepte la configuration rendue par infra et par les scripts de dev', () => {
    const result = buildEntraConfig(DEV)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.tenantId).toBe(TENANT)
    expect(result.config.clientId).toBe(CLIENT)
    expect(result.config.tenantSubdomain).toBe('lehubextiddev')
  })

  it('dérive la base Native Auth du sous-domaine plutôt que du GUID', () => {
    const result = buildEntraConfig(DEV)
    if (!result.ok) return
    expect(result.config.nativeAuthBaseUrl).toBe(
      'https://lehubextiddev.ciamlogin.com/lehubextiddev.onmicrosoft.com',
    )
    // Le GUID n'est pas accepté en segment de chemin par ces endpoints : s'il apparaissait
    // ici, chaque appel repartirait en 400 sans que rien ne dise pourquoi.
    expect(result.config.nativeAuthBaseUrl).not.toContain(TENANT)
  })

  it('dérive le JWKS de l’hôte de l’autorité, pas de celui de l’émetteur', () => {
    const result = buildEntraConfig(DEV)
    if (!result.ok) return
    // Vérifié contre la découverte publiée par le tenant dev : les clés sont servies sur
    // l'hôte du sous-domaine, tandis que l'émetteur porte le GUID en hôte.
    expect(result.config.jwksUri).toBe(
      `https://lehubextiddev.ciamlogin.com/${TENANT}/discovery/v2.0/keys`,
    )
    expect(new URL(result.config.jwksUri).hostname).toBe(new URL(result.config.authority).hostname)
    expect(new URL(result.config.jwksUri).hostname).not.toBe(new URL(result.config.issuer).hostname)
  })

  it("refuse une autorité qui ne se termine pas par la version", () => {
    for (const value of [
      `https://lehubextiddev.ciamlogin.com/${TENANT}`,
      `https://lehubextiddev.ciamlogin.com/${TENANT}/v1.0`,
      'https://lehubextiddev.ciamlogin.com/',
    ]) {
      const result = buildEntraConfig({ ...DEV, ENTRA_AUTHORITY: value })
      expect(result.ok, value).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('authority-without-version')
    }
  })

  it('refuse chaque réglage manquant en le nommant, sans repli', () => {
    const cases: [keyof typeof DEV, string][] = [
      ['ENTRA_TENANT_ID', 'missing-tenant-id'],
      ['ENTRA_CLIENT_ID', 'missing-client-id'],
      ['ENTRA_AUTHORITY', 'missing-authority'],
      ['ENTRA_ISSUER', 'missing-issuer'],
    ]
    for (const [name, kind] of cases) {
      for (const value of [undefined, '', '   ']) {
        const result = buildEntraConfig({ ...DEV, [name]: value })
        expect(result.ok, `${name}=${String(value)}`).toBe(false)
        if (result.ok) return
        expect(result.error.kind).toBe(kind)
        expect(describeEntraConfigError(result.error)).toContain(name)
      }
    }
  })

  it("refuse l'émetteur passé en autorité, la confusion que main.bicep documente", () => {
    const result = buildEntraConfig({ ...DEV, ENTRA_AUTHORITY: DEV.ENTRA_ISSUER })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('authority-is-the-issuer')
    expect(describeEntraConfigError(result.error)).toContain('ENTRA_ISSUER')
  })

  it("refuse une autorité qui n'est pas une URL https sur un hôte ciamlogin.com", () => {
    const values = [
      'lehubextiddev.ciamlogin.com',
      '/lehubextiddev',
      `http://lehubextiddev.ciamlogin.com/${TENANT}/v2.0`,
      `https://login.microsoftonline.com/${TENANT}/v2.0`,
      'https://ciamlogin.com/x',
    ]
    for (const value of values) {
      const result = buildEntraConfig({ ...DEV, ENTRA_AUTHORITY: value })
      expect(result.ok, value).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('invalid-authority')
    }
  })

  it('normalise les barres obliques finales une fois pour toutes', () => {
    const result = buildEntraConfig({
      ...DEV,
      ENTRA_AUTHORITY: `${DEV.ENTRA_AUTHORITY}//`,
      ENTRA_ISSUER: `${DEV.ENTRA_ISSUER}/`,
    })
    if (!result.ok) return
    expect(result.config.authority).toBe(DEV.ENTRA_AUTHORITY)
    expect(result.config.issuer).toBe(DEV.ENTRA_ISSUER)
  })
})

describe('isEntraConfigured', () => {
  it("reflète la validité de la configuration, comme les autres drapeaux de la sonde", () => {
    expect(isEntraConfigured(DEV)).toBe(true)
    expect(isEntraConfigured({})).toBe(false)
  })
})
