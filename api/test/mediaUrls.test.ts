import { describe, expect, it } from 'vitest'
import {
  buildMediaConfig,
  describeMediaConfigError,
  mediaUrl,
  type MediaConfig,
} from '../src/lib/mediaUrls'

const LOCAL = {
  MEDIA_BASE_URL: 'http://127.0.0.1:10000/devstoreaccount1/media',
}

const CLOUD = {
  MEDIA_BASE_URL: 'https://stlehubmediadevth2wpr.blob.core.windows.net/media',
}

/** Shorthand for the assertions that only care about composition. */
function configOf(env: NodeJS.ProcessEnv): MediaConfig {
  const result = buildMediaConfig(env)
  if (!result.ok) throw new Error(describeMediaConfigError(result.error))
  return result.config
}

describe('buildMediaConfig', () => {
  it('accepts the emulator and the cloud endpoints alike', () => {
    for (const env of [LOCAL, CLOUD]) {
      const result = buildMediaConfig(env)
      expect(result.ok, env.MEDIA_BASE_URL).toBe(true)
    }
  })

  it('refuses a missing setting rather than falling back', () => {
    for (const env of [{}, { MEDIA_BASE_URL: '' }, { MEDIA_BASE_URL: '   ' }]) {
      const result = buildMediaConfig(env)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('missing-base-url')
      expect(describeMediaConfigError(result.error)).toContain('MEDIA_BASE_URL')
    }
  })

  it('refuses a value that is not an absolute http(s) URL', () => {
    // A relative base is the tempting mistake: it concatenates without complaining and
    // produces paths the static host answers with its own 404 page.
    for (const value of ['/media', 'media', 'stlehub.blob.core.windows.net/media', 'ftp://host/media']) {
      const result = buildMediaConfig({ MEDIA_BASE_URL: value })
      expect(result.ok, value).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('invalid-base-url')
    }
  })

  it('strips trailing slashes from the base', () => {
    const result = buildMediaConfig({ MEDIA_BASE_URL: `${CLOUD.MEDIA_BASE_URL}//` })
    expect(result.ok && result.config.baseUrl).toBe(CLOUD.MEDIA_BASE_URL)
  })
})

describe('mediaUrl', () => {
  it('composes an absolute URL from a stored path', () => {
    expect(mediaUrl('communities/aznug.png', configOf(CLOUD))).toBe(
      'https://stlehubmediadevth2wpr.blob.core.windows.net/media/communities/aznug.png',
    )
  })

  it('leaves exactly one slash whatever each side carries', () => {
    const bases = [CLOUD.MEDIA_BASE_URL, `${CLOUD.MEDIA_BASE_URL}/`]
    const paths = ['communities/aznug.png', '/communities/aznug.png']
    for (const MEDIA_BASE_URL of bases) {
      for (const path of paths) {
        expect(mediaUrl(path, configOf({ MEDIA_BASE_URL })), `${MEDIA_BASE_URL} + ${path}`).toBe(
          'https://stlehubmediadevth2wpr.blob.core.windows.net/media/communities/aznug.png',
        )
      }
    }
  })

  it('keeps an absent path absent instead of pointing at the container root', () => {
    const config = configOf(CLOUD)
    for (const path of [null, undefined, '', '   ']) {
      expect(mediaUrl(path, config), JSON.stringify(path)).toBeNull()
    }
  })

  it('percent-encodes each segment, so a blob name cannot break out of the path', () => {
    const config = configOf(CLOUD)
    const base = 'https://stlehubmediadevth2wpr.blob.core.windows.net/media'
    // Blob names legitimately contain all of these. Raw, '#' would truncate the URL and
    // '?' would start a query string.
    expect(mediaUrl('communities/aznug#2.png', config)).toBe(`${base}/communities/aznug%232.png`)
    expect(mediaUrl('communities/a?b.png', config)).toBe(`${base}/communities/a%3Fb.png`)
    expect(mediaUrl('communities/Azure User Group.png', config)).toBe(
      `${base}/communities/Azure%20User%20Group.png`,
    )
    // Separators stay separators.
    expect(mediaUrl('a/b/c.png', config)).toBe(`${base}/a/b/c.png`)
  })

  it('refuses a path that would address something outside the container', () => {
    const config = configOf(CLOUD)
    for (const path of ['../secrets.png', 'communities/../../x.png', './x.png', '..', '/', '///']) {
      expect(mediaUrl(path, config), path).toBeNull()
    }
  })

  it('does not care whether the blob exists — that is the client\'s failure to handle', () => {
    expect(mediaUrl('does/not/exist.png', configOf(CLOUD))).toBe(
      'https://stlehubmediadevth2wpr.blob.core.windows.net/media/does/not/exist.png',
    )
  })
})
