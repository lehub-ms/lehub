import { randomUUID } from 'node:crypto'
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import type { ContainerClient } from '@azure/storage-blob'
import { z } from 'zod'
import { canUploadEventBanner, canUploadTo } from '../lib/authz'
import { getAdminEvent } from '../lib/eventsRepo'
import { errorResponse, forbidden, routeLabel } from '../lib/httpErrors'
import { sniffImage } from '../lib/imageSniff'
import { getMediaContainer } from '../lib/mediaStorage'
import { getMediaConfig, mediaUrl } from '../lib/mediaUrls'
import {
  DESTINATION_KINDS,
  DESTINATION_PREFIXES,
  MAX_UPLOAD_BYTES,
  UPLOAD_DESTINATION,
  type UploadDestination,
} from '../lib/uploadSchemas'
import { withAuthorization, type AuthenticatedSession } from '../lib/withAuthorization'

/**
 * The one way to write to the media container.
 *
 * Feature #70 made the container publicly readable and made entities carry a relative path
 * rather than an absolute URL. This is the missing direction: an authorised request drops a file
 * and gets back the path to store.
 *
 * Everything a caller asserts about the file is ignored. The filename never reaches the blob
 * name — it is generated here — and the declared content type never decides the format: the
 * bytes do (lib/imageSniff). "C'est le contenu qui décide" is Story #154's edge case, and it is
 * also the only version of this that is safe.
 *
 * **Orphan blobs are accepted and not collected**, which Story #154 asks be said out loud rather
 * than left implicit. The upload necessarily precedes the entity being saved, because the panel
 * previews the real URL; the alternative is a two-phase commit for a logo. A stray blob costs
 * fractions of a cent a month against the 25 €/month design cap, the account keeps seven days of
 * soft delete, and the container is `publicAccess: 'Blob'` rather than `'Container'`, so an
 * orphan is unreachable without its exact generated name and is not listed to anyone. A sweep
 * would need an inventory of every referenced path across three tables plus a grace window for
 * uploads in flight — a background job, not part of this route.
 */
/** Same choice as `lib/validation.ts`: this repository's identifiers are not all RFC 4122. */
const GUID = z.guid()

interface UploadResult {
  /** What the entity stores. */
  path: string
  /** What the panel previews, composed here so no browser has to reimplement `mediaUrls`. */
  url: string | null
}

/**
 * The writer is a parameter so the handler can be exercised without a storage account, the same
 * shape `authorized(handler, resolvePermissions)` already uses for the permissions read.
 */
export type BlobWriter = (
  blobName: string,
  bytes: Uint8Array,
  headers: { blobContentType: string; blobContentDisposition?: string },
) => Promise<void>

function containerWriter(container: ContainerClient): BlobWriter {
  return async (blobName, bytes, headers) => {
    await container.getBlockBlobClient(blobName).uploadData(bytes, {
      blobHTTPHeaders: headers,
      // A generated UUID does not collide, and this makes that a property of the write rather
      // than an assumption about randomness: two simultaneous uploads cannot overwrite one
      // another, which is Story #154's edge case, and a name reuse fails loudly instead.
      conditions: { ifNoneMatch: '*' },
    })
  }
}

/**
 * Resolves the communities of the event a banner is for, or `null` when there is no event yet.
 *
 * A parameter, like the writer, so the destination that needs a database can still be exercised
 * without one.
 */
export type EventCommunitiesReader = (eventId: string) => Promise<readonly string[] | null>

const readEventCommunities: EventCommunitiesReader = async (eventId) => {
  const event = await getAdminEvent(eventId)
  return event ? event.communities.map((community) => community.id) : null
}

export function uploadImage(write?: BlobWriter, readCommunities = readEventCommunities) {
  return async function mediaUpload(
    request: HttpRequest,
    context: InvocationContext,
    session: AuthenticatedSession,
  ): Promise<HttpResponseInit> {
    const route = routeLabel(request)

    // Advisory, and worth doing: it refuses an oversized upload before a single byte is
    // buffered. A chunked request carries no length, so it is not the authoritative check.
    const declared = Number(request.headers.get('content-length') ?? '0')
    if (declared > MAX_UPLOAD_BYTES) return tooLarge()

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      context.error('Multipart body could not be read', { route })
      return errorResponse(400, 'INVALID_MULTIPART', 'The request body is not readable multipart form data.')
    }

    const destination = UPLOAD_DESTINATION.safeParse(form.get('destination'))
    if (!destination.success) {
      context.error('Upload destination refused', { route, code: 'invalid_destination' })
      return errorResponse(400, 'INVALID_DESTINATION', 'The destination is not one this route accepts.')
    }

    // Authorisation before the file is looked at, and the refusal names nothing: someone who may
    // not write must get the same 403 whether their file was valid or not.
    let allowed: boolean
    if (destination.data === 'event-banner') {
      // The event is optional: the form uploads before the event exists, because it previews
      // the real URL. Given one, the permission is the event's; given none, it is "may this
      // account create events at all". See `canUploadEventBanner`.
      const eventId = form.get('eventId')
      const target = typeof eventId === 'string' && eventId.length > 0 ? eventId : null

      if (target && !GUID.safeParse(target).success) {
        context.error('Upload event identifier refused', { route })
        return errorResponse(400, 'INVALID_EVENT_ID', 'The event identifier is not in the expected form.')
      }

      let communities: readonly string[] | null = null
      if (target) {
        try {
          communities = await readCommunities(target)
        } catch (error) {
          context.error('Failed to read the event of a banner upload', { route }, error)
          return errorResponse(500, 'EVENT_FETCH_ERROR', 'Unable to read the event.')
        }
        // An identifier that resolves to nothing is refused as a permission, not as a 404: the
        // caller has no event to prove anything about, and `canUploadEventBanner` would happily
        // fall back to the creation case and let them through.
        if (!communities) {
          return forbidden(context, {
            route,
            action: 'upload:event-banner',
            objectId: session.identity.objectId,
          })
        }
      }

      allowed = canUploadEventBanner(session.permissions, communities)
    } else {
      allowed = canUploadTo(session.permissions, destination.data)
    }

    if (!allowed) {
      return forbidden(context, {
        route,
        action: `upload:${destination.data}`,
        objectId: session.identity.objectId,
      })
    }

    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) {
      context.error('Upload without a usable file', { route })
      return errorResponse(400, 'NO_FILE', 'A non-empty file part is required.')
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    // The authoritative size check, on what actually arrived.
    if (bytes.byteLength > MAX_UPLOAD_BYTES) return tooLarge()

    const image = sniffImage(bytes)
    // The bytes decide the format, and the **destination** decides which formats it takes: a
    // banner is a photograph, so SVG is refused there (#148) while a logo still accepts it.
    if (!image || !DESTINATION_KINDS[destination.data].includes(image.kind)) {
      context.error('Upload refused on its content', {
        route,
        destination: destination.data,
        declared: file.type.slice(0, 60),
      })
      return errorResponse(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'The image format is not one this destination accepts, decided from the file content.',
      )
    }

    const path = `${DESTINATION_PREFIXES[destination.data]}/${randomUUID()}${image.extension}`

    try {
      await (write ?? containerWriter(getMediaContainer()))(path, bytes, {
        blobContentType: image.contentType,
        // An SVG is the one accepted format that can carry markup. It is rendered through
        // `<img>`, where no script runs, and it is served from a distinct origin that holds no
        // session — but a viewer who opens the blob URL directly gets a document on that origin,
        // and the storage endpoint serves no CSP of its own. `attachment` closes that last
        // door: browsers ignore it for `<img>`, so the avatar still renders, and honour it on
        // navigation, which downloads instead of executing.
        ...(image.kind === 'svg' ? { blobContentDisposition: 'attachment' } : {}),
      })
    } catch (error) {
      // The error travels as its own argument rather than nested in the object, as
      // `listFetchError` already does: the host serialises a top-level Error into message,
      // type and stack, whereas one buried in a property renders as `{}`.
      context.error('Failed to write the uploaded image', { route }, error)
      return errorResponse(500, 'UPLOAD_FAILED', 'Unable to store the uploaded image.')
    }

    const result: UploadResult = { path, url: mediaUrl(path, getMediaConfig()) }
    return { status: 201, jsonBody: result }
  }

  function tooLarge(): HttpResponseInit {
    return errorResponse(
      413,
      'FILE_TOO_LARGE',
      `The image exceeds the ${String(MAX_UPLOAD_BYTES)} byte limit.`,
    )
  }
}

app.http('mediaUpload', {
  methods: ['POST'],
  authLevel: 'anonymous',
  // Not under `admin/`: an event banner is an organiser's upload, not an administrator's. The
  // destination decides the permission, not the URL.
  route: 'media/uploads',
  handler: withAuthorization(uploadImage()),
})
