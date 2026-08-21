import { CalendarDays } from 'lucide-react'
import type { EventSummary } from '@/lib/api'
import { communityGradient } from '@/lib/communityPalette'
import { formatEventDateRange } from '@/lib/formatEventDate'
import { CommunityAvatar } from './CommunityAvatar'
import { CommunityAvatarStack } from './CommunityAvatarStack'
import { TechnologyPill } from './TechnologyPill'

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

  return (
    <article className="glass-strong flex flex-col overflow-hidden rounded-[20px]">
      <div
        className="relative h-40 shrink-0"
        style={{
          backgroundImage: event.bannerImageUrl
            ? `url(${event.bannerImageUrl})`
            : communityGradient(primaryCommunity?.id ?? event.id),
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
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

        {event.communities.length === 1 && primaryCommunity && (
          <span className="inline-flex max-w-full items-center gap-1.5 self-start rounded-full border border-slate-200 bg-slate-100 py-1 pr-2.5 pl-1 text-xs font-medium text-slate-600">
            <CommunityAvatar community={primaryCommunity} size={18} />
            <span className="truncate">{primaryCommunity.name}</span>
          </span>
        )}
        {event.communities.length > 1 && <CommunityAvatarStack communities={event.communities} />}

        {event.technologies.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {event.technologies.map((technology) => (
              <TechnologyPill key={technology.id} technology={technology} />
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
