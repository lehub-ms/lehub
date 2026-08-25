import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// This suite reaches outside api/ on purpose. The seed media are two halves of one
// thing — bytes under db/seed/media, paths inside the seed files — and nothing else in
// CI reads either: the pipeline runs the three packages' test suites and az bicep
// build, no shellcheck, no compose validation. A path pointing at a file that was
// renamed or never committed would otherwise only surface as a broken image on
// someone's machine, or as a 404 on a public environment.

const ROOT = resolve(import.meta.dirname, '..', '..')
const MEDIA_DIR = join(ROOT, 'db', 'seed', 'media')
const COMMON_SH = join(ROOT, 'scripts', 'lib', 'common.sh')

/**
 * The reference folders, read from the uploader's own definition rather than repeated
 * here. Duplicating the list would let the two drift silently in the one direction that
 * hurts: a folder this file calls reference but blob-seed.sh does not is uploaded
 * locally by the --demo sweep, which takes everything, and never uploaded to an Azure
 * environment — so the rows resolve to 404s in production and nothing on this machine
 * ever shows it.
 */
function referenceFolders(): string[] {
  const declaration = readFileSync(COMMON_SH, 'utf8').match(/^MEDIA_REFERENCE_DIRS=\(([^)]*)\)/m)
  if (!declaration) throw new Error(`MEDIA_REFERENCE_DIRS not found in ${COMMON_SH}`)
  return (declaration[1] as string).split(/\s+/).filter((folder) => folder !== '')
}

// The two tiers, and the whole point of this file. Reference media reach every
// environment through ./scripts/blob-seed.sh; demonstration media never leave this
// machine. A folder is what decides which, so a placeholder cannot ride along to Azure
// by being named in the wrong seed.
interface Tier {
  seed: string
  folders: readonly string[]
}

const TIERS: readonly Tier[] = [
  { seed: 'reference.sql', folders: referenceFolders() },
  // Not read from anywhere: blob-seed.sh has no demonstration list, it sweeps whatever
  // folder is not a reference one. Naming them here is what makes a brand-new folder
  // claimed by neither tier fail the last test below, which is the point.
  { seed: 'demo.sql', folders: ['communities', 'events'] },
]

const ALL_FOLDERS = TIERS.flatMap((tier) => tier.folders)

/** Blob names on disk, relative to db/seed/media, forward-slashed as blobs are. */
function mediaOnDisk(dir: string = MEDIA_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return mediaOnDisk(full)
    if (entry.name === 'README.md') return []
    return [relative(MEDIA_DIR, full).split(sep).join('/')]
  })
}

/** Top-level folder of a blob name — what decides which tier a file belongs to. */
function tierOf(path: string): string {
  return path.split('/')[0] as string
}

/** Blob paths a seed stores — the N'<folder>/…' literals, one folder per entity. */
function mediaInSeed(seed: string, folders: readonly string[] = ALL_FOLDERS): string[] {
  const sql = readFileSync(join(ROOT, 'db', 'seed', seed), 'utf8')
  const matches = sql.matchAll(new RegExp(`N'((?:${folders.join('|')})/[^']+)'`, 'g'))
  return [...matches].map((match) => match[1] as string)
}

/** Everything both seeds reference, whichever tier it belongs to. */
function allMediaInSeeds(): string[] {
  return TIERS.flatMap((tier) => mediaInSeed(tier.seed))
}

describe.each(TIERS)('$seed media', ({ seed, folders }) => {
  const onDisk = mediaOnDisk().filter((path) => folders.includes(tierOf(path)))

  it('backs every seeded blob path with a committed file', () => {
    for (const path of mediaInSeed(seed, folders)) {
      expect(onDisk, path).toContain(path)
    }
  })

  it('references every committed file from the seed', () => {
    // The other direction matters too: an orphan file is uploaded on every bootstrap
    // and displayed nowhere, which reads as a bug in the seed.
    for (const path of onDisk) {
      expect(mediaInSeed(seed, folders), path).toContain(path)
    }
  })

  it('references no media of the other tier', () => {
    // The load-bearing assertion. Reference media are deployed to every environment and
    // demonstration media to none of them, so a placeholder named in reference.sql — or
    // an icon named in demo.sql — would send bytes where they must never go.
    const foreign = ALL_FOLDERS.filter((folder) => !folders.includes(folder))
    expect(mediaInSeed(seed, foreign)).toEqual([])
  })
})

describe('seed media', () => {
  it('declares at least one reference folder', () => {
    // Guards the regex above: a rename or a reformatting of MEDIA_REFERENCE_DIRS that it
    // stopped matching would otherwise make every tier assertion vacuously true.
    expect(referenceFolders().length).toBeGreaterThan(0)
  })

  it('keeps the paths relative, so one dataset is valid in every environment', () => {
    for (const path of allMediaInSeeds()) {
      expect(path.startsWith('http'), path).toBe(false)
      expect(path.startsWith('/'), path).toBe(false)
    }
  })

  it('gives each seeded row a blob of its own', () => {
    // Two rows sharing a path is a copy-paste, not a decision: the visuals exist to
    // tell the entities apart on screen.
    const paths = allMediaInSeeds()
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('files everything on disk under a known tier', () => {
    // A new top-level folder is a new deployment decision — which environments does it
    // reach? — and must be made in TIERS before its bytes can be committed.
    for (const path of mediaOnDisk()) {
      expect(ALL_FOLDERS, path).toContain(tierOf(path))
    }
  })

  it('commits media small enough to stay reviewable in a diff', () => {
    // Placeholders are vector marks of about a kilobyte, product icons a few. A file an
    // order of magnitude larger is a real asset that has no business in a public
    // repository.
    for (const path of mediaOnDisk()) {
      const bytes = statSync(join(MEDIA_DIR, ...path.split('/'))).size
      expect(bytes, path).toBeLessThan(64 * 1024)
    }
  })
})
