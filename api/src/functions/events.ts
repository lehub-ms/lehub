import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { listUpcomingEvents } from '../lib/eventsRepo'

export async function events(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    return { status: 200, jsonBody: await listUpcomingEvents() }
  } catch (error) {
    // The message can name a server or a database, so it goes to the logs and never
    // to the client; the caller gets a stable code it can branch on.
    context.error('Failed to list upcoming events', error)
    return {
      status: 500,
      jsonBody: { code: 'EVENTS_FETCH_ERROR', message: 'Unable to list events.' },
    }
  }
}

app.http('events', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'events',
  handler: events,
})
