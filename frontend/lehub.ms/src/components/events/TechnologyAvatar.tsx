import type { NamedRef } from '@/lib/api'
import { technologyPillColors } from '@/lib/technologyPalette'
import { cn } from '@/lib/cn'

interface TechnologyAvatarProps {
  technology: NamedRef
  size?: number
  className?: string
  /** Set by callers that provide their own accessible name (e.g. a filter summary chip). */
  hidden?: boolean
}

/**
 * A technology's initial on a deterministic, AA-safe background color — the same shape
 * as `CommunityAvatar`, so the two dimensions look consistent everywhere they appear
 * side by side (filter rows, the drawer's selection recap, `EventCard`'s pill badges).
 */
export function TechnologyAvatar({ technology, size = 24, className, hidden }: TechnologyAvatarProps) {
  return (
    <span
      aria-hidden={hidden}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-heading font-bold text-white',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4375),
        backgroundColor: technologyPillColors(technology.id).text,
      }}
    >
      {technology.name.charAt(0).toUpperCase()}
    </span>
  )
}
