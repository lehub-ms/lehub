import type { NamedRef } from '@/lib/api'
import { CommunityAvatar } from './CommunityAvatar'

interface CommunityAvatarStackProps {
  communities: NamedRef[]
  max?: number
}

/**
 * Up to `max` overlapping avatars, with a single accessible name listing every
 * organizing community — required because the inner avatars are `aria-hidden`, so the
 * name has to live on the wrapper (`role="img"`) rather than be assembled from children.
 */
export function CommunityAvatarStack({ communities, max = 3 }: CommunityAvatarStackProps) {
  const visible = communities.slice(0, max)
  const hiddenCount = communities.length - visible.length

  return (
    <div
      role="img"
      aria-label={`Organisé par : ${communities.map((community) => community.name).join(', ')}`}
      className="flex items-center"
    >
      {visible.map((community, index) => (
        <CommunityAvatar
          key={community.id}
          community={community}
          size={22}
          hidden
          className={index === 0 ? '' : '-ml-1.5 border-2 border-white'}
        />
      ))}
      {hiddenCount > 0 && (
        <span
          aria-hidden="true"
          className="-ml-1.5 flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 border-white bg-primary-xs text-[0.5625rem] font-bold text-primary"
        >
          +{hiddenCount}
        </span>
      )}
    </div>
  )
}
