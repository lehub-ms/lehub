import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { listTechnologies } from '../lib/technologiesRepo'
import { listFetchError } from '../lib/httpErrors'

/**
 * The active technologies, alphabetical — the counterpart of `communities`, and anonymous for
 * the same reasons.
 *
 * It exists because #147 asks an *organiser* to attach technologies to an event, and
 * `manage/technologies` is closed to anyone who is not a global administrator. Rather than
 * widening that route — which would hand an organiser the archived entries and the counts it
 * deliberately withholds — the public half gets its own listing, exactly as communities already
 * have one.
 */
export async function technologies(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    return { status: 200, jsonBody: await listTechnologies() }
  } catch (error) {
    return listFetchError(
      context,
      'Failed to list technologies',
      error,
      'TECHNOLOGIES_FETCH_ERROR',
      'Unable to list technologies.',
    )
  }
}

app.http('technologies', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'technologies',
  handler: technologies,
})
