import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { listEventOptions } from '../lib/eventsRepo'
import { listFetchError } from '../lib/httpErrors'

/**
 * The two closed vocabularies an event is qualified by: its type (`dbo.FormatType`) and its
 * format (`dbo.EventMode`).
 *
 * Anonymous, like `communities` and for the same reason: the event form needs them, and the
 * organiser filling it in is not necessarily a global administrator — `manage/technologies` and
 * its siblings are, by design, closed to them. There is nothing to withhold in the word
 * "Meetup", and the public site will want the same list the day it filters on it.
 *
 * One route for both rather than two, because nothing ever reads one without the other: they
 * are the two required choices of a single block of a single form.
 */
export async function eventOptions(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    return { status: 200, jsonBody: await listEventOptions() }
  } catch (error) {
    return listFetchError(
      context,
      'Failed to list the event vocabularies',
      error,
      'EVENT_OPTIONS_FETCH_ERROR',
      'Unable to list the event types and formats.',
    )
  }
}

app.http('eventOptions', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'event-options',
  handler: eventOptions,
})
