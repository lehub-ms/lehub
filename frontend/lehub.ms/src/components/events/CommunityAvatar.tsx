import type { NamedRef } from '@/lib/api'
import { communityColor } from '@/lib/communityPalette'
import { cn } from '@/lib/cn'

interface CommunityAvatarProps {
  community: NamedRef
  size?: number
  className?: string
  /** Set by callers that provide their own accessible name (e.g. `CommunityAvatarStack`). */
  hidden?: boolean
}

/** A community's initial on a deterministic, AA-safe background color. */
export function CommunityAvatar({ community, size = 24, className, hidden }: CommunityAvatarProps) {
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
        backgroundColor: communityColor(community.id),
      }}
    >
      {community.name.charAt(0).toUpperCase()}
    </span>
  )
}
