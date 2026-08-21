import type { NamedRef } from '@/lib/api'
import { technologyPillColors } from '@/lib/technologyPalette'
import { TechnologyAvatar } from './TechnologyAvatar'

interface TechnologyPillProps {
  technology: NamedRef
}

/**
 * `TechnologyAvatar` (initial-on-color-circle, same shape as `CommunityAvatar`) + name.
 * No per-technology icon: the design mock's icon set is a hardcoded 6-entry map that
 * can't generalize to arbitrary DB rows an admin may add later.
 */
export function TechnologyPill({ technology }: TechnologyPillProps) {
  const { bg, text } = technologyPillColors(technology.id)

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: bg, color: text }}
    >
      <TechnologyAvatar technology={technology} size={14} hidden />
      {technology.name}
    </span>
  )
}
