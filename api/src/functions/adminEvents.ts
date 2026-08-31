import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { canCreateEvent, canManageCommunityEvents } from '../lib/authz'
import { createEvent, listCommunityEvents } from '../lib/eventsRepo'
import { eventWriteRefusal } from '../lib/eventResponses'
import { CREATE_EVENT, EVENT_LIST_QUERY } from '../lib/eventSchemas'
import { forbidden, listFetchError, routeLabel } from '../lib/httpErrors'
import { parseBody, parseQuery } from '../lib/validation'
import { withAuthorization, type AuthenticatedSession } from '../lib/withAuthorization'

/**
 * The events of one community, as the backoffice needs them: past ones included, attachments
 * and stored banner path included, ordered soonest first.
 *
 * A route of its own rather than a parameter on the public `events`, for the three reasons
 * `adminCommunities` already gives — `withAuth`'s enumeration of anonymous routes must stay a
 * decision rather than become a lie, the two answers are different shapes, and the public
 * listing is cacheable while this one is resolved per session and must never be.
 *
 * **Validate before authorising, here and only here.** Everywhere else in this API the order is
 * the reverse, and `lib/validation.ts` explains why: a caller who may not write must not be able
 * to tell a malformed body from a refusal. That reasoning does not apply to this route, because
 * the permission *is* the parameter — there is no question to ask before knowing which community
 * is meant. Nothing leaks either way: an unparseable `communityId` names no community, so its
 * 400 confirms nothing that a 403 would have hidden.
 */
export async function adminEvents(
  request: HttpRequest,
  context: InvocationContext,
  session: AuthenticatedSession,
): Promise<HttpResponseInit> {
  if (request.method === 'POST') return create(request, context, session)

  const query = parseQuery(request, context, EVENT_LIST_QUERY)
  if (!query.ok) return query.response

  if (!canManageCommunityEvents(session.permissions, query.value.communityId)) {
    return forbidden(context, {
      route: routeLabel(request),
      action: 'read:community-events',
      objectId: session.identity.objectId,
    })
  }

  try {
    return { status: 200, jsonBody: await listCommunityEvents(query.value.communityId) }
  } catch (error) {
    return listFetchError(
      context,
      'Failed to list the events of a community',
      error,
      'COMMUNITY_EVENTS_FETCH_ERROR',
      'Unable to list the events of this community.',
    )
  }
}

/**
 * Creating an event.
 *
 * **Validate then authorise**, as on the listing above and for a sharper version of the same
 * reason: the permission is computed from the body. `canCreateEvent` asks whether the caller
 * organises at least one of the communities the event will carry, and there is no way to ask
 * that of a body that has not been read. Nothing leaks — a malformed body names no community, so
 * its 400 confirms nothing a 403 would have hidden.
 *
 * The rule `canCreateEvent` enforces is about **signature, not about restricting
 * co-organisation**: an organiser may attach any active community they like, including ones they
 * have nothing to do with (#147), but they may not publish an event carrying *only* other
 * people's communities. Removals are what is bounded, and that is #147's business.
 */
async function create(
  request: HttpRequest,
  context: InvocationContext,
  session: AuthenticatedSession,
): Promise<HttpResponseInit> {
  const body = await parseBody(request, context, CREATE_EVENT)
  if (!body.ok) return body.response

  if (!canCreateEvent(session.permissions, body.value.communityIds)) {
    return forbidden(context, {
      route: routeLabel(request),
      action: 'create:event',
      objectId: session.identity.objectId,
    })
  }

  let result
  try {
    result = await createEvent(body.value)
  } catch (error) {
    return listFetchError(
      context,
      'Failed to create an event',
      error,
      'EVENT_WRITE_ERROR',
      'Unable to create the event.',
    )
  }

  if (!result.ok) return eventWriteRefusal(result)

  return { status: 201, jsonBody: result.event }
}

app.http('adminEvents', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  // `manage/` and not `admin/`: the Functions host reserves `/admin` for its own management
  // API, and refuses to start any function whose route begins with it. See adminCommunities.
  route: 'manage/events',
  handler: withAuthorization(adminEvents),
})
