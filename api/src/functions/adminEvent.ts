import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { canDetachCommunity, canWriteEvent, sameId } from '../lib/authz'
import { eventWriteRefusal } from '../lib/eventResponses'
import { deleteEvent, getAdminEvent, updateEvent, type AdminEvent } from '../lib/eventsRepo'
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
export function eventHandler(read = getAdminEvent, write = updateEvent, remove = deleteEvent) {
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
        action: ACTIONS[request.method] ?? 'update:event',
        objectId: session.identity.objectId,
      })
    }

    if (request.method === 'GET') return { status: 200, jsonBody: event }
    if (request.method === 'DELETE') return erase(context, event.id, remove)

    return modify(request, context, session, event, write)
  }
}

/** L'action journalisée avec le refus, par méthode. Un refus non nommé ne se cherche pas. */
const ACTIONS: Record<string, string> = {
  GET: 'read:event',
  PATCH: 'update:event',
  DELETE: 'delete:event',
}

function notFound(): HttpResponseInit {
  return errorResponse(404, 'EVENT_NOT_FOUND', 'No event carries this identifier.')
}

/**
 * Deletes the event, definitively.
 *
 * The same permission as a modification, and deliberately not a stricter one: #149 says so
 * explicitly — "elle obéit à la même règle que toute écriture sur un évènement". The event has
 * already been read and arbitrated by the caller; this only has to carry out the deletion and
 * answer the race.
 *
 * `204` and no body, like the referential deletions. A row that vanished between the read and
 * the delete answers 404 rather than pretending to have removed something, which is the edge
 * case of an event already deleted from another tab.
 */
async function erase(
  context: InvocationContext,
  eventId: string,
  remove: typeof deleteEvent,
): Promise<HttpResponseInit> {
  let result
  try {
    result = await remove(eventId)
  } catch (error) {
    return listFetchError(
      context,
      'Failed to delete an event',
      error,
      'EVENT_WRITE_ERROR',
      'Unable to delete the event.',
    )
  }

  if (!result.ok) return notFound()

  return { status: 204 }
}

/**
 * The one asymmetry of co-organisation, enforced: attaching is open, detaching is not.
 *
 * **Only removals are examined.** An organiser may attach any community they like, including
 * ones they have nothing to do with — that is how a joint evening gets organised without asking
 * an administrator, and #147 makes the openness explicit rather than incidental. So this
 * computes the difference and asks a question about each *departure*, never about an arrival.
 *
 * `canDetachCommunity` is asked about **the set as it would be with this one still in it** —
 * `[...submitted, id]` — never about the set as it is stored. That distinction is the whole
 * subtlety here, and getting it wrong is a bug this route shipped once: the predicate's last
 * clause asks "does another community remain", and answered against the *stored* set it refused
 * a straight swap, where the only community is replaced by another one. The event carries
 * exactly one community either way; nothing was ever about to be orphaned. Asked about the
 * result, the same clause says what it means — and it keeps catching the removal of two
 * communities at once, which each per-item check would wave through on its own.
 *
 * Its other clause still does its work: an organiser may only remove a community they organise
 * themselves, because removing someone else's is evicting a co-organiser.
 *
 * The emptiness check that follows is not that clause repeated. It catches the one case the loop
 * cannot see — a body submitting `[]` against an event that already carried no community, where
 * nothing is removed and yet nothing remains.
 *
 * Handing the event over is deliberately still allowed: removing one's own last community while
 * another remains passes every rule. The screen warns that access goes with it.
 */
function refuseDetachment(
  request: HttpRequest,
  context: InvocationContext,
  session: AuthenticatedSession,
  stored: AdminEvent,
  submitted: readonly string[] | undefined,
): HttpResponseInit | null {
  if (!submitted) return null

  const current = stored.communities.map((community) => community.id)
  const removed = current.filter((id) => !submitted.some((kept) => sameId(kept, id)))

  const refuse = (action: string): HttpResponseInit =>
    forbidden(context, {
      route: routeLabel(request),
      action,
      objectId: session.identity.objectId,
    })

  for (const id of removed) {
    // `id` n'est pas dans `submitted` — c'est la définition d'un retrait — donc la concaténation
    // ne crée pas de doublon, et décrit exactement l'ensemble d'où on l'enlève.
    if (!canDetachCommunity(session.permissions, [...submitted, id], id)) {
      return refuse('detach:community')
    }
  }

  if (submitted.length === 0 && !session.permissions.isGlobalAdmin) {
    return refuse('detach:last-community')
  }

  return null
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
  session: AuthenticatedSession,
  stored: AdminEvent,
  write: typeof updateEvent,
): Promise<HttpResponseInit> {
  const body = await parseBody(request, context, UPDATE_EVENT)
  if (!body.ok) return body.response

  const detachment = refuseDetachment(request, context, session, stored, body.value.communityIds)
  if (detachment) return detachment

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
  methods: ['GET', 'PATCH', 'DELETE'],
  authLevel: 'anonymous',
  // `manage/` and not `admin/`: the Functions host reserves `/admin`. See adminCommunities.
  route: 'manage/events/{eventId}',
  handler: withAuthorization(eventHandler()),
})
