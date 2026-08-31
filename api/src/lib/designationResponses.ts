import type { HttpResponseInit } from '@azure/functions'
import { errorResponse } from './httpErrors'
import type { DesignateResult } from './organizersRepo'

/**
 * The refusals a designation can produce, as HTTP.
 *
 * Here rather than in a function module because both families answer them and `httpErrors`
 * already records what happens when one shape is spelled twice: the two spellings drift.
 *
 * `ACCOUNT_NOT_FOUND` is the one refusal in this API that says something true about a person,
 * and it is deliberate rather than an oversight: the caller is entitled to designate, the
 * address came from a search this same API answered, and the screen has a sentence to compose —
 * "cette personne n'a pas de compte LeHub". Withholding it would leave the panel unable to tell
 * a missing account from a broken server. It is not an enumeration channel either: the search
 * route already told this caller which addresses exist, under the same habilitation.
 */
export function designationRefusal(
  result: Extract<DesignateResult, { ok: false }>,
): HttpResponseInit {
  switch (result.error) {
    case 'account-not-found':
      return errorResponse(
        404,
        'ACCOUNT_NOT_FOUND',
        'No LeHub account carries this email address.',
      )
    case 'community-not-found':
      return errorResponse(404, 'COMMUNITY_NOT_FOUND', 'No community carries this identifier.')
    case 'already-designated':
      return errorResponse(
        409,
        'ALREADY_DESIGNATED',
        'This account is already designated on this scope.',
      )
  }
}
