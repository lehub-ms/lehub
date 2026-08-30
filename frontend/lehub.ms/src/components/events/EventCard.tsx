import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import type { EventSummary } from '@/lib/api'
import { communityGradient } from '@lehub/shared/lib/communityPalette'
import { formatEventDateRange } from '@/lib/formatEventDate'
import { EntityRow } from './EntityRow'

interface EventCardProps {
  event: EventSummary
}

/**
 * Identical on the homepage and `/evenements`. Deliberately not clickable in this
 * feature — no `onClick`, no hover lift, no `cursor-pointer` — the detail-view
 * interaction is a future feature (see Feature #5's "Hors-scope").
 */
export function EventCard({ event }: EventCardProps) {
  const [primaryCommunity] = event.communities
  // The API composes the banner's URL from the stored blob path without checking that the
  // blob exists, and the media host can also be refused by the CSP. Either way the load
  // fails, and only an <img> reports that — a CSS background-image emits no error event at
  // all, which is what left an empty frame where the gradient should have been.
  const [bannerFailed, setBannerFailed] = useState(false)

  return (
    <article className="glass-strong flex flex-col overflow-hidden rounded-[20px]">
      <div
        className="relative h-40 shrink-0"
        // The gradient sits *under* the banner instead of being its alternative, so a
        // banner that fails to load simply unmounts and reveals what is already painted —
        // no empty frame, and no flash of nothing in between.
        style={{ background: communityGradient(primaryCommunity?.id ?? event.id) }}
      >
        {event.bannerImageUrl && !bannerFailed && (
          <img
            src={event.bannerImageUrl}
            // Decorative: the <h3> below already carries the event's identity, so naming
            // the banner would only repeat it.
            alt=""
            onError={() => {
              setBannerFailed(true)
            }}
            className="absolute inset-0 size-full object-cover"
          />
        )}

        {/* After the banner in DOM order, so they keep painting over it. */}
        <span className="absolute bottom-2 left-2 rounded-full border border-[rgb(29_78_216/0.18)] bg-white/90 px-2.5 py-1 text-[0.6875rem] font-semibold text-[#1D4ED8] backdrop-blur-sm">
          {event.format}
        </span>
        <span className="absolute right-2 bottom-2 rounded-full border border-white/15 bg-slate-900/70 px-2.5 py-1 text-[0.6875rem] font-semibold text-white backdrop-blur-sm">
          {event.mode}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-5">
        <h3 className="line-clamp-2 font-heading text-base font-semibold text-ink">{event.title}</h3>

        {event.description && (
          <p className="line-clamp-2 text-[0.8125rem] leading-relaxed text-ink-muted">
            {event.description}
          </p>
        )}

        <p className="mt-auto flex items-center gap-1.5 pt-1 text-[0.8125rem] text-ink-muted">
          <CalendarDays aria-hidden="true" className="size-[13px] shrink-0" />
          <time dateTime={event.startDate}>{formatEventDateRange(event.startDate, event.endDate)}</time>
        </p>

        <hr className="my-1 border-primary/10" />

        {/* Both lists follow the exact same rule, so they are the exact same component:
            full pills while they fit, the logos alone otherwise, "+N" when even those
            don't. Neither may ever wrap — a second line would make this card taller than
            its neighbours in the grid. */}
        {event.communities.length > 0 && (
          <EntityRow entities={event.communities} kind="community" label="Organisé par" />
        )}
        {event.technologies.length > 0 && (
          <EntityRow entities={event.technologies} kind="technology" label="Technologies abordées" />
        )}
      </div>
    </article>
  )
}
