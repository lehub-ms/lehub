import type { HttpResponseInit } from '@azure/functions'
import { errorResponse } from './httpErrors'
import type { EventWriteResult } from './eventsRepo'

/**
 * The refusals a write to an event can produce, as HTTP.
 *
 * Here rather than in a function module because two routes answer them — the collection and the
 * single event — and `referenceResponses` already records what happens when one shape is spelled
 * twice: the two spellings drift.
 *
 * `unknown-reference` answers **400 and not 409**. A 409 says "the state of the server is at odds
 * with your request", which is what a duplicate name or a still-referenced entry is; this is a
 * body pointing at something that does not exist, and the only way out is to send something else
 * — which is exactly what a 400 means. Its own code rather than `INVALID_BODY`, because the body
 * was perfectly well shaped and the client branches on it differently: one is a bug in the form,
 * the other is a stale list to reload.
 */
export function eventWriteRefusal(
  result: Extract<EventWriteResult, { ok: false }>,
): HttpResponseInit {
  switch (result.error) {
    case 'unknown-reference':
      return errorResponse(
        400,
        'UNKNOWN_REFERENCE',
        'One of the referenced communities, technologies, types or formats does not exist.',
      )
    case 'not-found':
      return errorResponse(404, 'EVENT_NOT_FOUND', 'No event carries this identifier.')
  }
}
