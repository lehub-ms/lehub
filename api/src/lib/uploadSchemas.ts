import { z } from 'zod'
import type { ImageKind } from './imageSniff'

/**
 * Where an uploaded image is going, and therefore under which prefix it is filed and who is
 * allowed to put it there.
 *
 * A closed token and never a caller-supplied prefix: the server maps token to prefix, so the set
 * of reachable prefixes is finite and a `../` can never arrive. That is what "rangé sous un
 * préfixe déterminé par sa destination" means once written down.
 *
 * `event-banner` joined them with Story #148, and the addition really was what this comment
 * promised: a line here, a line in `authz`, and nothing in the route's shape. The route is named
 * `media/uploads` rather than anything referential-specific for exactly that reason.
 */
export const UPLOAD_DESTINATIONS = ['community-logo', 'technology-logo', 'event-banner'] as const

export type UploadDestination = (typeof UPLOAD_DESTINATIONS)[number]

/** The directory tree of `db/seed/media/` is the container's tree; these are its two branches. */
export const DESTINATION_PREFIXES: Record<UploadDestination, string> = {
  'community-logo': 'communities',
  'technology-logo': 'technologies',
  'event-banner': 'events',
}

/**
 * Which image formats each destination accepts, decided from the bytes and never from what the
 * caller declares.
 *
 * A logo is often a vector, so SVG belongs there. **A banner is a photograph**, 1600 × 900, and
 * #148 lists JPG, PNG and WebP — an SVG banner is either a mistake or an attempt, and neither
 * deserves the `Content-Disposition: attachment` dance that logos need. Story #148 asks for the
 * check to be server-side "et pas seulement par l'attribut du champ", and a table is what makes
 * that true per destination rather than globally.
 */
export const DESTINATION_KINDS: Record<UploadDestination, readonly ImageKind[]> = {
  'community-logo': ['png', 'jpeg', 'webp', 'svg'],
  'technology-logo': ['png', 'jpeg', 'webp', 'svg'],
  'event-banner': ['png', 'jpeg', 'webp'],
}

export const UPLOAD_DESTINATION = z.enum(UPLOAD_DESTINATIONS).meta({
  id: 'UploadDestination',
  title: 'Destination d’un téléversement',
  description:
    'Le champ `destination` du corps multipart de POST /api/media/uploads. Il décide du préfixe ' +
    'sous lequel le blob est rangé et de l’habilitation exigée.',
})

/**
 * 2 Mio. A logo is an SVG or a small PNG, and a 1600×900 WebP banner weighs around 200 kio, so
 * this is generous for what it accepts and small enough that a handful of concurrent uploads
 * cannot exhaust a Flex Consumption instance. Far below the host's own request ceiling too, so
 * the platform never truncates a request before this does.
 */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
