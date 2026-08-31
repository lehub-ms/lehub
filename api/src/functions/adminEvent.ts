import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { canWriteEvent } from '../lib/authz'
import { eventWriteRefusal } from '../lib/eventResponses'
import { getAdminEvent, updateEvent, type AdminEvent } from '../lib/eventsRepo'
import { UPDATE_EVENT } from '../lib/eventSchemas'
import { errorResponse, forbidden, listFetchError, routeLabel } from '../lib/httpErrors'
import { guidParam, parseBody } from '../lib/validation'
import { withAuthorization, type AuthenticatedSession } from '../lib/withAuthorization'

/**
 * One event: read it, or modify it.
 *
 * **The event is read before anything is decided**, because the permission is a property of the
 * row: `canWriteEvent` asks whether the caller organises one of the communities the event
 * carries. There is no way to ask that without the event in hand — which is why this route, like
 * the collection's POST, reads first and arbitrates second.
 *
 * A missing event therefore answers **404 before 403**, and that is deliberate rather than an
 * accident of ordering. Elsewhere a refusal names nothing, so that it cannot be used to
 * enumerate what exists; here there is nothing to enumerate — every event in this database is
 * published on lehub.ms, and its identifier is in the public listing. Withholding the 404 would
 * hide nothing and would leave a shared link to a deleted event indistinguishable from a
 * permission problem, which is precisely the confusion #146 asks to avoid.
 *
 * The GET is arbitrated by the *write* predicate. Reading this projection is not reading the
 * event — it carries the stored banner path and every attachment, and it exists to be edited.
 * Same reasoning as the administration view of a referential (#151).
 *
 * The reader and the writer are parameters so this layer can be exercised without a database —
 * the same shape `uploadImage(write?)` and `authorized(handler, resolvePermissions)` already
 * use. The refusal path is the one that most needs a test and the one a database would make
 * hardest to reach; the defaults are the real repository, and no caller in `src/` passes
 * anything else.
 */
export function eventHandler(read = getAdminEvent, write = updateEvent) {
  return async function adminEvent(
    request: HttpRequest,
    context: InvocationContext,
    session: AuthenticatedSession,
  ): Promise<HttpResponseInit> {
    const id = guidParam(request, context, 'eventId')
    if (!id.ok) return id.response

    let event: AdminEvent | null
    try {
      event = await read(id.value)
    } catch (error) {
      return listFetchError(
        context,
        'Failed to read an event',
        error,
        'EVENT_FETCH_ERROR',
        'Unable to read the event.',
      )
    }

    if (!event) return notFound()

    if (!canWriteEvent(session.permissions, event.communities.map((community) => community.id))) {
      return forbidden(context, {
        route: routeLabel(request),
        action: request.method === 'GET' ? 'read:event' : 'update:event',
        objectId: session.identity.objectId,
      })
    }

    if (request.method === 'GET') return { status: 200, jsonBody: event }

    return modify(request, context, event, write)
  }
}

function notFound(): HttpResponseInit {
  return errorResponse(404, 'EVENT_NOT_FOUND', 'No event carries this identifier.')
}

/**
 * Applies the patch, once the dates have been checked against what is actually stored.
 *
 * The ordering rule cannot live in the schema: a patch may carry an end date and not a start
 * date, and the missing half is in the row. Merging here is what makes "moving the end before
 * the start" impossible in one field as well as in two — a check on the body alone would let it
 * through every time the caller sent only one date.
 */
async function modify(
  request: HttpRequest,
  context: InvocationContext,
  stored: AdminEvent,
  write: typeof updateEvent,
): Promise<HttpResponseInit> {
  const body = await parseBody(request, context, UPDATE_EVENT)
  if (!body.ok) return body.response

  const startDate = body.value.startDate ?? stored.startDate
  const endDate = body.value.endDate ?? stored.endDate
  if (Date.parse(endDate) < Date.parse(startDate)) {
    context.error('Event date range refused', { route: routeLabel(request) })
    return errorResponse(
      400,
      'INVALID_DATE_RANGE',
      'The end date must not precede the start date.',
    )
  }

  let result
  try {
    result = await write(stored.id, body.value)
  } catch (error) {
    return listFetchError(
      context,
      'Failed to update an event',
      error,
      'EVENT_WRITE_ERROR',
      'Unable to update the event.',
    )
  }

  if (!result.ok) return eventWriteRefusal(result)

  return { status: 200, jsonBody: result.event }
}

app.http('adminEvent', {
  methods: ['GET', 'PATCH'],
  authLevel: 'anonymous',
  // `manage/` and not `admin/`: the Functions host reserves `/admin`. See adminCommunities.
  route: 'manage/events/{eventId}',
  handler: withAuthorization(eventHandler()),
})
