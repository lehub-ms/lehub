import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { isSqlConfigured } from '../lib/sqlClient'

/**
 * Liveness probe.
 *
 * Deliberately does not open a database connection: it must answer while the
 * database is stopped, paused (Azure SQL serverless auto-pauses after 60 minutes)
 * or still being migrated. `sqlConfigured` reports whether the settings are present,
 * not whether the server is reachable.
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
