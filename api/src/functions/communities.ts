import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { listCommunities } from '../lib/communitiesRepo'
import { listFetchError } from '../lib/httpErrors'

export async function communities(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    return { status: 200, jsonBody: await listCommunities() }
  } catch (error) {
    return listFetchError(
      context,
      'Failed to list communities',
      error,
      'COMMUNITIES_FETCH_ERROR',
      'Unable to list communities.',
    )
  }
}

app.http('communities', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'communities',
  handler: communities,
})
