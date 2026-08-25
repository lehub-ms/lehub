import type { NamedRef } from '@/lib/api'
import { EntityAvatar } from './EntityAvatar'

interface TechnologyAvatarProps {
  technology: NamedRef
  size?: number
  className?: string
  /** Set by callers that provide their own accessible name (e.g. a filter summary chip). */
  hidden?: boolean
}

/** A technology's icon, or its initial on a plain neutral gray. */
export function TechnologyAvatar({ technology, size, className, hidden }: TechnologyAvatarProps) {
  return <EntityAvatar entity={technology} kind="technology" size={size} className={className} hidden={hidden} />
}
