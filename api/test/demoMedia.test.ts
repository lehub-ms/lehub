import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// This suite reaches outside api/ on purpose. The demonstration media are two halves
// of one thing — bytes under db/seed/media, paths inside db/seed/demo.sql — and
// nothing else in CI reads either: the pipeline runs the three packages' test suites
// and az bicep build, no shellcheck, no compose validation. A path pointing at a file
// that was renamed or never committed would otherwise only surface as a broken image
// on someone's machine.

const ROOT = resolve(import.meta.dirname, '..', '..')
const MEDIA_DIR = join(ROOT, 'db', 'seed', 'media')
const DEMO_SQL = join(ROOT, 'db', 'seed', 'demo.sql')

/** Blob names on disk, relative to db/seed/media, forward-slashed as blobs are. */
function mediaOnDisk(dir: string = MEDIA_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return mediaOnDisk(full)
    if (entry.name === 'README.md') return []
    return [relative(MEDIA_DIR, full).split(sep).join('/')]
  })
}

/** Blob paths the seed stores — the N'<folder>/…' literals, one folder per entity. */
const FOLDERS = ['communities', 'events', 'technologies'] as const

function mediaInSeed(): string[] {
  const sql = readFileSync(DEMO_SQL, 'utf8')
  const matches = sql.matchAll(new RegExp(`N'((?:${FOLDERS.join('|')})/[^']+)'`, 'g'))
  return [...matches].map((match) => match[1] as string)
}

describe('demonstration media', () => {
  it('backs every seeded blob path with a committed file', () => {
    for (const path of mediaInSeed()) {
      expect(mediaOnDisk(), path).toContain(path)
    }
  })

  it('references every committed file from the seed', () => {
    // The other direction matters too: an orphan file is uploaded to the emulator on
    // every bootstrap and displayed nowhere, which reads as a bug in the seed.
    for (const path of mediaOnDisk()) {
      expect(mediaInSeed(), path).toContain(path)
    }
  })

  it('keeps the paths relative, so one dataset is valid in every environment', () => {
    for (const path of mediaInSeed()) {
      expect(path.startsWith('http'), path).toBe(false)
      expect(path.startsWith('/'), path).toBe(false)
    }
  })

  it('gives each seeded row a blob of its own', () => {
    // Two rows sharing a path is a copy-paste, not a decision: the visuals exist to
    // tell the demonstration entities apart on screen.
    const paths = mediaInSeed()
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('commits media small enough to stay reviewable in a diff', () => {
    // Placeholders are vector marks of about a kilobyte. A file an order of magnitude
    // larger is a real asset that has no business in a public repository.
    for (const path of mediaOnDisk()) {
      const bytes = statSync(join(MEDIA_DIR, ...path.split('/'))).size
      expect(bytes, path).toBeLessThan(64 * 1024)
    }
  })
})
