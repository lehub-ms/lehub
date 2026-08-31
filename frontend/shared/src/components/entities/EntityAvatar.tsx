import { useState } from 'react'
import type { NamedRef } from '../../lib/api'
import { communityColor } from '../../lib/communityPalette'
import { cn } from '../../lib/cn'
import { initials } from '../../lib/initials'

export type EntityKind = 'community' | 'technology'

/**
 * Technologies carry no colour of their own in the database, so this deliberately does
 * not invent one — it is Tailwind's `slate-600`, the filled counterpart of the neutral
 * `bg-slate-100`/`text-slate-600` chip the entity pills already use. Inline rather than a
 * class so both kinds go through the same single code path.
 */
const TECHNOLOGY_FALLBACK = '#475569'
interface EntityAvatarProps {
  entity: NamedRef
  kind: EntityKind
  size?: number
  className?: string
  /** Set by callers that already name the entity (pill text, the row's `aria-label`). */
  hidden?: boolean
  /**
   * What the fallback colour is drawn from, when it should not be the entity's id.
   *
   * The edit panel previews a community *being created*, which has no id yet — the server
   * assigns it. Without this the preview would draw one colour and the saved row another, and
   * "what you see in the panel is what the public site will show" would be false at exactly the
   * moment someone is looking at it. Seeding on the name keeps the preview stable while it is
   * typed and is what the create form uses.
   */
  seed?: string
}

/**
 * The one place a community's or a technology's mark is rendered: its logo when one is
 * set and loads, its initial on a deterministic background otherwise.
 *
 * The slot is a fixed `size × size` circle either way, which is what keeps a list mixing
 * logo and no-logo entries aligned — and what makes the `onError` swap cost zero layout,
 * so it can never disturb `EntityRow`'s width measurement.
 */
export function EntityAvatar({
  entity,
  kind,
  size = 24,
  className,
  hidden,
  seed,
}: EntityAvatarProps) {
  // The media host is on the CSP's img-src, so a cross-origin logo does load. What that
  // does not guarantee is that the blob behind the stored path exists: the API composes
  // the URL without checking. Same reasoning — and same remedy — as `CommunitiesCarousel`.
  const [logoFailed, setLogoFailed] = useState(false)
  const showLogo = entity.logoUrl !== null && !logoFailed
  const mark = initials(entity.name)

  return (
    <span
      aria-hidden={hidden}
      data-avatar=""
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        // An explicit white disc, never a transparent one: the same avatar has to stay
        // legible on the card's light glass and on a coloured ground, and a logo with a
        // transparent background would otherwise inherit whatever sits behind it.
        // Logotypes are exempt from 1.4.3, so the hairline border is the contrast carrier.
        showLogo ? 'border border-slate-200 bg-white' : 'font-heading font-bold text-white',
        className,
      )}
      style={{
        width: size,
        height: size,
        ...(showLogo
          ? {}
          : {
              // Two glyphs need to be smaller than one to sit inside the same disc without
              // touching its edge. Driven by what is actually rendered, so a one-word name keeps
              // the larger, better-balanced single initial.
              fontSize: Math.round(size * (mark.length > 1 ? 0.36 : 0.4375)),
              backgroundColor:
                kind === 'community' ? communityColor(seed ?? entity.id) : TECHNOLOGY_FALLBACK,
            }),
      }}
    >
      {showLogo ? (
        <img
          src={entity.logoUrl ?? undefined}
          // Empty when the container already carries the name, so it is announced once
          // rather than twice. Never omitted — a missing `alt` would announce the URL.
          alt={hidden ? '' : entity.name}
          decoding="async"
          // `size-full` pins BOTH axes, which is what an SVG with no intrinsic dimensions
          // needs — left alone it would take the 300×150 replaced-element default.
          // `object-contain` then letterboxes any aspect ratio inside the square instead
          // of cropping or stretching it, and the padding keeps a full-bleed mark off the
          // border.
          className="size-full object-contain p-[12%]"
          onError={() => {
            setLogoFailed(true)
          }}
        />
      ) : (
        mark
      )}
    </span>
  )
}
