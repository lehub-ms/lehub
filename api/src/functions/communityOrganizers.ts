import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { canDesignateOrganizer } from '../lib/authz'
import { ACCOUNT_EMAIL } from '../lib/designationSchemas'
import { designationRefusal } from '../lib/designationResponses'
import { forbidden, listFetchError, routeLabel } from '../lib/httpErrors'
import { designateOrganizer, listOrganizers, removeOrganizer } from '../lib/organizersRepo'
import { guidParam, parseBody } from '../lib/validation'
import { withAuthorization, type AuthenticatedSession } from '../lib/withAuthorization'

/** The trace's vocabulary, one entry per verb, as `adminCommunity` spells it. */
const ACTIONS: Record<string, string> = {
  GET: 'read:organizers',
  POST: 'designate:organizer',
  DELETE: 'remove:organizer',
}

/**
 * The organisers of one community: reading them, designating one, removing one.
 *
 * `canDesignateOrganizer` guards all three, and it is the only permission an organiser can
 * *grant*: they may co-opt on the communities they organise, and nowhere else. Refusing that
 * would make the maintainer the bottleneck of every organising team that grows — the very thing
 * Epic #88 exists to remove. A global administrator may do it everywhere.
 *
 * Reading is arbitrated by the write predicate, as `adminCommunities` already does for the
 * referential's administration view and for the same reason: this is not public data about a
 * community, it is the list of the people who run it, with their addresses.
 *
 * **The route never looks at the community's status.** Archived or not, only the habilitation
 * decides, which is what lets #175 give a global administrator access to an archived
 * community's organisers without reopening this file.
 *
 * The removal carries its address in a body rather than in a path segment: Application Insights
 * records the whole URL of every request, and an address placed there would be logged on each
 * call. See `lib/designationSchemas` — no personal data travels in a URL in this family.
 */
export async function communityOrganizers(
  request: HttpRequest,
  context: InvocationContext,
  session: AuthenticatedSession,
): Promise<HttpResponseInit> {
  // The identifier is read before the guard, because the guard is *about* it: there is no
  // "designate somewhere" permission to check first. A malformed one is refused as such, and
  // never reaches `organizes`, where it would silently match nothing and read as a 403.
  const communityId = guidParam(request, context, 'communityId')
  if (!communityId.ok) return communityId.response

  if (!canDesignateOrganizer(session.permissions, communityId.value)) {
    return forbidden(context, {
      route: routeLabel(request),
      action: ACTIONS[request.method] ?? 'write:organizers',
      objectId: session.identity.objectId,
    })
  }

  if (request.method === 'POST') return designate(communityId.value, request, context, session)
  if (request.method === 'DELETE') return remove(communityId.value, request, context)

  try {
    return { status: 200, jsonBody: await listOrganizers(communityId.value) }
  } catch (error) {
    return listFetchError(
      context,
      'Failed to list the organisers of a community',
      error,
      'ORGANIZERS_FETCH_ERROR',
      'Unable to list the organisers.',
    )
  }
}

/**
 * Authorise first, validate second. Someone who may not designate on this community must receive
 * the same 403 whether their body was well-formed or not — validating first would let them tell
 * "my payload was wrong" from "I am not allowed", which is an enumeration channel.
 */
async function designate(
  communityId: string,
  request: HttpRequest,
  context: InvocationContext,
  session: AuthenticatedSession,
): Promise<HttpResponseInit> {
  const body = await parseBody(request, context, ACCOUNT_EMAIL)
  if (!body.ok) return body.response

  let result
  try {
    result = await designateOrganizer(communityId, body.value.email, session.identity.objectId)
  } catch (error) {
    return listFetchError(
      context,
      'Failed to designate an organiser',
      error,
      'ORGANIZER_WRITE_ERROR',
      'Unable to designate the organiser.',
    )
  }

  if (!result.ok) return designationRefusal(result)

  return { status: 201, jsonBody: result.account }
}

/**
 * 204 whatever happened, and that is the specification rather than laziness: two concurrent
 * removals of the same designation must not make the second one fail, and an address that is
 * not designated has nothing left to remove. Removing the last organiser is allowed — the
 * community stays manageable by the global administrators.
 */
async function remove(
  communityId: string,
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const body = await parseBody(request, context, ACCOUNT_EMAIL)
  if (!body.ok) return body.response

  try {
    await removeOrganizer(communityId, body.value.email)
  } catch (error) {
    return listFetchError(
      context,
      'Failed to remove an organiser',
      error,
      'ORGANIZER_WRITE_ERROR',
      'Unable to remove the organiser.',
    )
  }

  return { status: 204 }
}

app.http('communityOrganizers', {
  methods: ['GET', 'POST', 'DELETE'],
  authLevel: 'anonymous',
  // `manage/` and not `admin/`: the Functions host reserves `/admin` for its own management API
  // and refuses to start any function whose route begins with it. See adminCommunities.ts.
  route: 'manage/communities/{communityId}/organizers',
  handler: withAuthorization(communityOrganizers),
})
