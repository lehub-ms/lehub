import { describe, expect, it } from 'vitest'
import { buildMediaStorageConfig, parseMediaContainer } from '../src/lib/mediaStorage'

const AZURE = 'https://stlehubmediadevabc123.blob.core.windows.net/media'
const AZURITE = 'http://127.0.0.1:10000/devstoreaccount1/media'

describe('parseMediaContainer', () => {
  it('sépare le service du conteneur sur la forme Azure', () => {
    expect(parseMediaContainer(AZURE)).toEqual({
      serviceUrl: 'https://stlehubmediadevabc123.blob.core.windows.net',
      container: 'media',
    })
  })

  it('sépare aussi la forme Azurite, dont le compte est un segment de chemin', () => {
    // C'est le cas qui interdit de deviner le conteneur en coupant sur le domaine.
    expect(parseMediaContainer(AZURITE)).toEqual({
      serviceUrl: 'http://127.0.0.1:10000/devstoreaccount1',
      container: 'media',
    })
  })

  it('tolère une barre oblique finale', () => {
    expect(parseMediaContainer(`${AZURE}/`)?.container).toBe('media')
  })

  it('refuse une base sans conteneur, plutôt que d’en inventer un', () => {
    expect(parseMediaContainer('https://compte.blob.core.windows.net')).toBeNull()
    expect(parseMediaContainer('pas une url')).toBeNull()
  })
})

describe('buildMediaStorageConfig', () => {
  it('bascule sur l’émulateur quand le mode le demande', () => {
    const result = buildMediaStorageConfig({
      MEDIA_BASE_URL: AZURITE,
      MEDIA_STORAGE_AUTH_MODE: 'emulator',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.config).toEqual({
      mode: 'emulator',
      connectionString: 'UseDevelopmentStorage=true',
      container: 'media',
    })
  })

  it('prend l’identité managée par défaut, sans réglage de mode', () => {
    const result = buildMediaStorageConfig({
      MEDIA_BASE_URL: AZURE,
      MEDIA_MI_CLIENT_ID: '11111111-2222-3333-4444-555555555555',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.config.mode).toBe('managed-identity')
  })

  it('refuse le mode identité managée sans client id, plutôt que d’essayer la chaîne par défaut', () => {
    // Sans lui, `ManagedIdentityCredential` viserait l'identité assignée par le système, qui
    // n'existe pas ici — et l'échec arriverait au premier téléversement en production.
    const result = buildMediaStorageConfig({ MEDIA_BASE_URL: AZURE })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error.kind).toBe('missing-client-id')
  })

  it('refuse une configuration sans base, et une base illisible', () => {
    expect(buildMediaStorageConfig({}).ok).toBe(false)
    expect(buildMediaStorageConfig({ MEDIA_BASE_URL: 'nope' }).ok).toBe(false)
  })
})
