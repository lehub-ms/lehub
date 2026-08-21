import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { listUpcomingEvents } from '../lib/eventsRepo'
import { listFetchError } from '../lib/httpErrors'

export async function events(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    return { status: 200, jsonBody: await listUpcomingEvents() }
  } catch (error) {
    return listFetchError(context, 'Failed to list upcoming events', error, 'EVENTS_FETCH_ERROR', 'Unable to list events.')
  }
}

app.http('events', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'events',
  handler: events,
})
