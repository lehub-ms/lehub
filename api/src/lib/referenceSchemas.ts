import { z } from 'zod'

/**
 * The bodies the reference-data routes accept: communities and technologies.
 *
 * Every bound here mirrors the column behind it — `Name NVARCHAR(200)`, `Description
 * NVARCHAR(300)` (migration 0002), `LogoPath NVARCHAR(500)` (0003), `Status NVARCHAR(20)` with
 * its CHECK (0006). The schema is the first line and the constraint the last: the schema gives a
 * caller a useful refusal, the database gives the guarantee, and `api/test/referenceSchemas.
 * test.ts` names both so the pair cannot drift apart unnoticed.
 *
 * `strictObject` throughout: an unrecognised key is refused rather than dropped, so a
 * misspelled field is seen instead of silently doing nothing.
 *
 * Every schema carries `.meta()`. That is not decoration — it is what lets Feature #170 emit
 * named `$defs` and their prose from the very object that validates, instead of a second
 * description written by hand beside it.
 */

/** Trimmed before it is measured: three spaces are not a name. */
const name = z.string().trim().min(1).max(200)

/** The one the public carousel shows, so the model bounds it rather than the card truncating it. */
const description = z.string().trim().max(300)

/** A blob path inside the media container, never a URL — see lib/mediaUrls. */
const logoPath = z.string().trim().min(1).max(500)

const status = z.enum(['active', 'archived'])

/**
 * Creation defaults to active, which is Story #152's and #153's "une entrée créée est active par
 * défaut" — expressed as the schema's default rather than as a line in each handler.
 *
 * `null` and absent both mean "no description" and both are accepted: the panel clears a field by
 * sending null, and a caller that never had one omits it. They collapse here so the repository
 * only ever sees one of them.
 */
export const CREATE_COMMUNITY = z
  .strictObject({
    name,
    description: description.nullable().default(null),
    logoPath: logoPath.nullable().default(null),
    status: status.default('active'),
  })
  .meta({
    id: 'CreateCommunity',
    title: 'Création d’une communauté',
    description: 'Le corps attendu par POST /api/admin/communities.',
  })

/**
 * Every field optional, but not all of them absent.
 *
 * PATCH and not PUT: reactivating an entry from its row sends `{ "status": "active" }` alone, and
 * a PUT would force that row to resend the name, the logo and the description it never read —
 * racing whatever a concurrent edit had just written. An absent field means unchanged.
 *
 * The "at least one field" rule is a refinement, and OpenAPI 3.0 has no way to say it, so it is
 * absent from the derived document. That is the one lossy corner of the derivation and it is
 * stated here rather than discovered by #170: the schema still refuses an empty body at runtime.
 */
export const UPDATE_COMMUNITY = z
  .strictObject({
    name: name.optional(),
    description: description.nullable().optional(),
    logoPath: logoPath.nullable().optional(),
    status: status.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one field must be supplied.',
  })
  .meta({
    id: 'UpdateCommunity',
    title: 'Modification d’une communauté',
    description: 'Le corps attendu par PATCH /api/admin/communities/{communityId}.',
  })

/**
 * A technology carries no description. It labels an event, it is not a profile — Story #153 says
 * so, and the absence is the specification rather than an oversight.
 */
export const CREATE_TECHNOLOGY = z
  .strictObject({
    name,
    logoPath: logoPath.nullable().default(null),
    status: status.default('active'),
  })
  .meta({
    id: 'CreateTechnology',
    title: 'Création d’une technologie',
    description: 'Le corps attendu par POST /api/admin/technologies.',
  })

export const UPDATE_TECHNOLOGY = z
  .strictObject({
    name: name.optional(),
    logoPath: logoPath.nullable().optional(),
    status: status.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one field must be supplied.',
  })
  .meta({
    id: 'UpdateTechnology',
    title: 'Modification d’une technologie',
    description: 'Le corps attendu par PATCH /api/admin/technologies/{technologyId}.',
  })

/**
 * Enumerated so the derivation test covers every schema by construction, and so #170 has one
 * place to read rather than a list to keep in step by hand. A schema added below and forgotten
 * here is the failure this guards against, so adding to this array is part of adding a schema.
 */
export const REFERENCE_SCHEMAS = [
  CREATE_COMMUNITY,
  UPDATE_COMMUNITY,
  CREATE_TECHNOLOGY,
  UPDATE_TECHNOLOGY,
] as const

export type CreateCommunityBody = z.infer<typeof CREATE_COMMUNITY>
export type UpdateCommunityBody = z.infer<typeof UPDATE_COMMUNITY>
export type CreateTechnologyBody = z.infer<typeof CREATE_TECHNOLOGY>
export type UpdateTechnologyBody = z.infer<typeof UPDATE_TECHNOLOGY>
