import type { HttpResponseInit } from '@azure/functions'
import { errorResponse } from './httpErrors'
import type { CommunityWriteResult } from './communitiesRepo'

/**
 * The refusals a write to the community referential can produce, as HTTP.
 *
 * Here rather than in a function module because two routes answer them — the collection and the
 * single entry — and `httpErrors` already records what happens when one shape is spelled twice:
 * the two spellings drift.
 *
 * Two unique indexes guard the table, and the caller has a different sentence for each. The slug
 * refusal carries the community already holding it, which #166 asks for by name; the count-style
 * extra field is the same accommodation `conflictWithCount` makes, for the same reason — a
 * screen cannot compose a sentence out of a code alone.
 */
export function communityWriteRefusal(
  result: Extract<CommunityWriteResult, { ok: false }>,
): HttpResponseInit {
  switch (result.error) {
    case 'slug-taken':
      return {
        status: 409,
        jsonBody: {
          code: 'COMMUNITY_SLUG_TAKEN',
          message: 'Another community already uses this slug.',
          holder: result.holder,
        },
      }
    case 'name-taken':
      return errorResponse(409, 'COMMUNITY_NAME_TAKEN', 'Another community already has this name.')
    case 'not-found':
      return errorResponse(404, 'COMMUNITY_NOT_FOUND', 'No community carries this identifier.')
  }
}
