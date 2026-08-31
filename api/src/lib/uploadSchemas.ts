import { z } from 'zod'

/**
 * Where an uploaded image is going, and therefore under which prefix it is filed and who is
 * allowed to put it there.
 *
 * A closed token and never a caller-supplied prefix: the server maps token to prefix, so the set
 * of reachable prefixes is finite and a `../` can never arrive. That is what "rangé sous un
 * préfixe déterminé par sa destination" means once written down.
 *
 * `event-banner` is not here yet. Story #149 adds it, with `canWriteEvent` over the event's
 * communities — the route is named `media/uploads` rather than anything referential-specific
 * precisely so that addition is a line in this file and a line in `authz`.
 */
export const UPLOAD_DESTINATIONS = ['community-logo', 'technology-logo'] as const

export type UploadDestination = (typeof UPLOAD_DESTINATIONS)[number]

/** The directory tree of `db/seed/media/` is the container's tree; these are its two branches. */
export const DESTINATION_PREFIXES: Record<UploadDestination, string> = {
  'community-logo': 'communities',
  'technology-logo': 'technologies',
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
