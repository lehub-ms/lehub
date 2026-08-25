import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { isMediaConfigured } from '../lib/mediaUrls'
import { isSqlConfigured } from '../lib/sqlClient'

/**
 * Liveness probe.
 *
 * Deliberately does not open a database connection: it must answer while the
 * database is stopped, paused (Azure SQL serverless auto-pauses after 60 minutes)
 * or still being migrated. `sqlConfigured` reports whether the settings are present,
 * not whether the server is reachable.
 *
 * `mediaConfigured` is the same kind of answer for MEDIA_BASE_URL. Media URLs are composed
 * on the data endpoints, so a missing setting would otherwise only surface as a 500 on
 * /api/events — this makes it readable from the probe that is already checked after every
 * deployment.
 */
export async function health(
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  return {
    status: 200,
    jsonBody: {
      status: 'ok',
      sqlConfigured: isSqlConfigured(),
      mediaConfigured: isMediaConfigured(),
      timestamp: new Date().toISOString(),
    },
  }
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: health,
})
