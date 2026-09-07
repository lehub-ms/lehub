import { DESIGNATION_SCHEMAS } from './designationSchemas'
import { EVENT_SCHEMAS } from './eventSchemas'
import { PREFERENCE_SCHEMAS } from './preferenceSchemas'
import { REFERENCE_SCHEMAS } from './referenceSchemas'
import { UPLOAD_DESTINATION } from './uploadSchemas'

/**
 * Every request schema this API declares, in one place.
 *
 * There is no OpenAPI document in this repository yet — Feature #170 writes it, and #171 states
 * that it derives it from these objects rather than reinventing a source of truth. What can
 * exist before that document, and what this constant is, is the guarantee that the document will
 * be *complete*: a route added without a description has to be caught by the chain, not by a
 * review.
 *
 * It exists because the per-family arrays were not enough. `openapiDerivation.test.ts` walked
 * `REFERENCE_SCHEMAS` alone, so `UPLOAD_DESTINATION` — which carries a full `.meta()` — was
 * covered by nothing at all, and a third family would have been just as invisible. The test now
 * walks this array, and asserts separately that no schema exported by any of the three modules
 * is missing from it. The two halves are what make forgetting impossible rather than unlikely:
 * one says everything listed is describable, the other says everything describable is listed.
 *
 * Adding a family is adding a line here and a spread below. Adding a schema to an existing
 * family is adding it to that family's own array, which this one spreads.
 */
export const ALL_REQUEST_SCHEMAS = [
  ...REFERENCE_SCHEMAS,
  UPLOAD_DESTINATION,
  ...DESIGNATION_SCHEMAS,
  ...EVENT_SCHEMAS,
  ...PREFERENCE_SCHEMAS,
] as const
