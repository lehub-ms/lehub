/**
 * The readable address of a community.
 *
 * `/c/azure-user-group-france/evenements` rather than
 * `/c/C1C1C1C1-0000-0000-0000-000000000001/evenements`. The identifier stays the key of the
 * database and of the API contract — the slug is a way of *addressing* a community, not a second
 * identity, and no route here ever accepts one (see `guidParam`).
 *
 * Written twice on purpose, here and in `frontend/admin.lehub.ms/src/lib/slug.ts`, which is the
 * documented choice of this repository for anything crossing the wire: `@lehub/shared` is a
 * front-end package and cannot be imported from a Functions app. This copy is the authority —
 * it decides what is stored — and the other one only *proposes* a slug as a name is typed.
 * `api/test/seedSlug.test.ts` keeps the migration, the seed and both copies from drifting.
 */

/** Long enough to stay readable, short enough to stay pasteable. */
const MAX_LENGTH = 60

/**
 * The column is wider than the generator: the spare characters are the disambiguation suffix's
 * room (`-2`, `-3`) and an administrator's room to type a longer one by hand.
 */
export const SLUG_COLUMN_LENGTH = 80

const SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Refused as a slug, so resolving an address never has to hesitate between the two forms. */
const GUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A name reduced to its addressable form, or the empty string when nothing survives.
 *
 * Returning `''` rather than inventing something is deliberate: the caller decides what an
 * untransposable name becomes. The API falls back to an identifier-derived slug so the stored
 * value is never empty; the form proposes nothing and asks.
 */
export function slugify(name: string): string {
  const folded = name
    // NFD splits a letter from its diacritic, which the next step then drops: "Communauté"
    // becomes "communaute" rather than being refused for carrying an accent.
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')

  const trimmed = trimDashes(folded)
  if (trimmed.length <= MAX_LENGTH) return trimmed

  // Cut, then back off to the last separator: a slug truncated mid-word reads as a typo.
  const cut = trimmed.slice(0, MAX_LENGTH)
  const lastDash = cut.lastIndexOf('-')
  return trimDashes(lastDash > 0 ? cut.slice(0, lastDash) : cut)
}

function trimDashes(value: string): string {
  return value.replace(/^-+/, '').replace(/-+$/, '')
}

/** The shape the column and the unique index expect, and the one a caller may submit. */
export function isValidSlug(value: string): boolean {
  if (value.length === 0 || value.length > SLUG_COLUMN_LENGTH) return false
  if (GUID_SHAPE.test(value)) return false
  return SHAPE.test(value)
}

/**
 * The slug of a community that has no transposable name — ideograms, symbols.
 *
 * Derived from the identifier so it is stable and unique without a lookup, and prefixed so it
 * reads as a fallback rather than as a mangled name.
 */
export function fallbackSlug(id: string): string {
  return `communaute-${id.toLowerCase().replace(/-/g, '').slice(0, 8)}`
}

/**
 * The slug to store for a name, never empty.
 *
 * Uniqueness is *not* decided here — `UX_Community_Slug` decides it, and the route reads its
 * verdict. This only guarantees a well-formed, non-empty candidate.
 */
export function slugFor(name: string, id: string): string {
  return slugify(name) || fallbackSlug(id)
}
