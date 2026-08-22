import type { NamedRef } from '@/lib/api'
import { cn } from '@/lib/cn'

interface TechnologyAvatarProps {
  // Not the full NamedRef: filter options are handed to this too, and they carry no logo.
  technology: Pick<NamedRef, 'id' | 'name'>
  size?: number
  className?: string
  /** Set by callers that provide their own accessible name (e.g. a filter summary chip). */
  hidden?: boolean
}

/**
 * A technology's initial on a plain neutral gray — unlike communities, technologies
 * carry no color of their own in the database, so this deliberately does not invent
 * one; it's the same flat treatment `EventCard`'s single-community pill already uses
 * for its own background (`bg-slate-100`/`text-slate-600`), just inverted for a filled
 * circle.
 */
export function TechnologyAvatar({ technology, size = 24, className, hidden }: TechnologyAvatarProps) {
  return (
    <span
      aria-hidden={hidden}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-slate-600 font-heading font-bold text-white',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4375) }}
    >
      {technology.name.charAt(0).toUpperCase()}
    </span>
  )
}
