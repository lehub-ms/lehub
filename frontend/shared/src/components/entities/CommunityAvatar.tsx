import type { NamedRef } from '../../lib/api'
import { EntityAvatar } from './EntityAvatar'

interface CommunityAvatarProps {
  community: NamedRef
  size?: number
  className?: string
  /** Set by callers that provide their own accessible name (e.g. a filter summary chip). */
  hidden?: boolean
  /** See `EntityAvatar`: the create panel previews an entry that has no id yet. */
  seed?: string
}

/** A community's logo, or its initial on a deterministic AA-safe background. */
export function CommunityAvatar({ community, size, className, hidden, seed }: CommunityAvatarProps) {
  return <EntityAvatar entity={community} kind="community" size={size} className={className} hidden={hidden} seed={seed} />
}
