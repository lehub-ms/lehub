import { z } from 'zod'

/**
 * The bodies the designation routes accept: searching LeHub accounts, and naming one of them.
 *
 * **No personal data travels in a URL anywhere in this family, and that is the reason the search
 * is a POST and the removals carry a body rather than a path segment.** Application Insights
 * records a request's full URL — path and query string — for every call, so an address or a
 * search fragment placed there would be logged on every request, in every environment, without
 * anything in this repository asking for it. `forbidden` and `invalidBody` take great care to
 * log an object identifier and never an address (`api/test/adminReference.test.ts` asserts it);
 * routing addresses through the URL would hand that back through the front door. A body is not
 * request telemetry, so it stays out.
 *
 * The email is the wire identifier of a person throughout the backoffice, and the identity's
 * object identifier is never published: Story #157 forbids it in the search response, and
 * `UX_User_Email` (migration 0001) makes the address unique, so the API resolves address →
 * `ExternalIdObjectId` on its own. One key, not two depending on the route.
 *
 * `strictObject` throughout, like `referenceSchemas`: an unrecognised key is refused rather than
 * dropped. Every schema carries `.meta()` — that is what lets Feature #170 emit named `$defs`
 * and their prose from the very object that validates, and `api/test/openapiDerivation.test.ts`
 * fails the day one of them stops being describable.
 */

/**
 * Two characters. Below that the answer would be most of the directory, which is precisely what
 * "la route ne renvoie rien sans requête" exists to prevent — the backoffice does not give
 * access to the list of registered accounts.
 *
 * The bound lives here rather than in the handler so the panel's own hint ("Tapez au moins 2
 * caractères") and the server's refusal cannot drift apart: the front-end reads this contract,
 * the server enforces it.
 */
export const MIN_SEARCH_LENGTH = 2

/**
 * Twenty matches, and the twenty-first is what tells the caller there are more.
 *
 * The repository reads `MAX_SEARCH_RESULTS + 1` rows and returns at most `MAX_SEARCH_RESULTS`;
 * the surplus row becomes `truncated: true` rather than a second `COUNT(*)` round-trip. Story
 * #157 asks for the overflow to be *signalled*, not silently cut.
 */
export const MAX_SEARCH_RESULTS = 20

/** `Email NVARCHAR(320)` — migration 0001. The schema bounds what the column bounds. */
export const EMAIL_COLUMN_LENGTH = 320

/**
 * Trimmed before it is measured, like every other free-text field here: two spaces are not a
 * query. The upper bound is generous and exists only so an unbounded string never reaches a
 * `LIKE` pattern.
 */
const query = z.string().trim().min(MIN_SEARCH_LENGTH).max(200)

/**
 * Not trimmed, deliberately, and it is the one place this module departs from `referenceSchemas`.
 *
 * An address is never typed here — it is echoed back from a search result the API itself
 * produced. Whitespace around it means the caller built the body from something else, and
 * `z.email()` refusing it is the right answer. Trimming would also cost the derivation its
 * `format: "email"`: a `.trim()` in front of a format check is a transform, and
 * `z.toJSONSchema` refuses transforms rather than emitting a silent `{}`.
 */
const email = z.email().max(EMAIL_COLUMN_LENGTH)

export const SEARCH_ACCOUNTS = z
  .strictObject({ q: query })
  .meta({
    id: 'SearchAccounts',
    title: 'Recherche d’un compte LeHub',
    description: 'Le corps attendu par POST /api/manage/accounts/search.',
  })

/**
 * One shape for four routes, which is what a `$ref` is for.
 *
 * Designating and removing take the same thing — an address — on both families, so writing four
 * near-identical schemas would give the derived document four names for one contract and four
 * places for a bound to drift.
 */
export const ACCOUNT_EMAIL = z
  .strictObject({ email })
  .meta({
    id: 'AccountEmail',
    title: 'Désignation d’un compte LeHub',
    description:
      'Le corps attendu par POST et DELETE sur /api/manage/communities/{communityId}/organizers ' +
      'et sur /api/manage/administrators. L’adresse désigne un compte existant ; le backoffice ' +
      'n’en crée aucun.',
  })

/**
 * Enumerated so the derivation test covers every schema by construction. Adding to this array is
 * part of adding a schema — `api/src/lib/requestSchemas.ts` gathers it with the others, and a
 * schema exported from this module but missing here fails `openapiDerivation.test.ts`.
 */
export const DESIGNATION_SCHEMAS = [SEARCH_ACCOUNTS, ACCOUNT_EMAIL] as const

export type SearchAccountsBody = z.infer<typeof SEARCH_ACCOUNTS>
export type AccountEmailBody = z.infer<typeof ACCOUNT_EMAIL>
