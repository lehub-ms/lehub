import { randomUUID } from 'node:crypto'
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { canWriteReferenceData } from '../lib/authz'
import { createCommunity, listAdminCommunities } from '../lib/communitiesRepo'
import { forbidden, listFetchError, routeLabel } from '../lib/httpErrors'
import { CREATE_COMMUNITY } from '../lib/referenceSchemas'
import { communityWriteRefusal } from '../lib/referenceResponses'
import { slugFor } from '../lib/slug'
import { parseBody } from '../lib/validation'
import { withAuthorization, type AuthenticatedSession } from '../lib/withAuthorization'

/**
 * The administration view of the community referential: every community, archived ones included,
 * with the counts the screen decides from.
 *
 * A route of its own rather than a parameter on the public `communities`, and the reasons are
 * three. `withAuth`'s doc comment enumerates the anonymous routes as a *decision written down*; a
 * parameter that flips a route between anonymous and authenticated turns that enumeration into a
 * lie. The two answers are different shapes, and one handler returning either would hand every
 * caller a union to narrow for nothing. And the public listing is cacheable while this one is
 * resolved per session and must never be — one URL cannot hold both policies.
 *
 * Reading it is arbitrated, unusually for this API, and by the *write* predicate: this is not the
 * reference data, it is the administration view of it. See the header of lib/authz.
 */
export async function adminCommunities(
  request: HttpRequest,
  context: InvocationContext,
  session: AuthenticatedSession,
): Promise<HttpResponseInit> {
  if (!canWriteReferenceData(session.permissions)) {
    return forbidden(context, {
      route: routeLabel(request),
      action: request.method === 'POST' ? 'create:community' : 'read:admin-communities',
      objectId: session.identity.objectId,
    })
  }

  if (request.method === 'POST') return create(request, context)

  try {
    return { status: 200, jsonBody: await listAdminCommunities() }
  } catch (error) {
    return listFetchError(
      context,
      'Failed to list communities for administration',
      error,
      'ADMIN_COMMUNITIES_FETCH_ERROR',
      'Unable to list communities.',
    )
  }
}

/**
 * Authorise first, validate second. Someone who may not write must receive the same 403 whether
 * their body was well-formed or not — validating first would let them tell "my payload was
 * wrong" from "I am not allowed", which is an enumeration channel. See lib/validation.
 */
async function create(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const body = await parseBody(request, context, CREATE_COMMUNITY)
  if (!body.ok) return body.response

  // The slug is proposed by the form; a caller that sends none gets one derived from the name.
  // `slugFor` never returns an empty string — an untransposable name falls back to an
  // identifier-derived slug rather than being refused.
  const slug = body.value.slug ?? slugFor(body.value.name, randomUUID())

  let result
  try {
    result = await createCommunity({ ...body.value, slug })
  } catch (error) {
    return listFetchError(
      context,
      'Failed to create a community',
      error,
      'COMMUNITY_WRITE_ERROR',
      'Unable to create the community.',
    )
  }

  if (!result.ok) return communityWriteRefusal(result)

  return { status: 201, jsonBody: result.community }
}

app.http('adminCommunities', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'admin/communities',
  handler: withAuthorization(adminCommunities),
})
