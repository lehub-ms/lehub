import type { NamedRef } from '@/lib/api'
import { TechnologyAvatar } from './TechnologyAvatar'

interface TechnologyPillProps {
  technology: NamedRef
}

/**
 * `TechnologyAvatar` (initial-on-gray circle, same shape as `CommunityAvatar`) + name,
 * on the same neutral gray chip `EventCard`'s single-community pill uses — technologies
 * have no color of their own in the database, so nothing here is per-technology.
 * No per-technology icon either: the design mock's icon set is a hardcoded 6-entry map
 * that can't generalize to arbitrary DB rows an admin may add later.
 */
export function TechnologyPill({ technology }: TechnologyPillProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
      <TechnologyAvatar technology={technology} size={14} hidden />
      {technology.name}
    </span>
  )
}
