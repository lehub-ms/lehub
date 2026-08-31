import type { HttpResponseInit } from '@azure/functions'
import { errorResponse } from './httpErrors'
import type { CommunityWriteResult } from './communitiesRepo'
import type { TechnologyWriteResult } from './technologiesRepo'

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

/**
 * Le pendant pour les technologies, qui n'ont pas de slug — donc deux issues, pas trois.
 *
 * Écrit plutôt que replié sur un `409` unique : `'not-found'` ici veut dire que l'INSERT a réussi
 * et que la relecture n'a rien rendu, une incohérence côté serveur. L'annoncer « ce nom est déjà
 * pris » enverrait chercher un doublon qui n'existe pas.
 */
export function technologyWriteRefusal(
  result: Extract<TechnologyWriteResult, { ok: false }>,
): HttpResponseInit {
  switch (result.error) {
    case 'name-taken':
      return errorResponse(409, 'TECHNOLOGY_NAME_TAKEN', 'Another technology already has this name.')
    case 'not-found':
      return errorResponse(404, 'TECHNOLOGY_NOT_FOUND', 'No technology carries this identifier.')
  }
}
