/** Loading placeholder matching `EventCard`'s outline, shown while events are in flight. */
export function EventCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      data-testid="event-card-skeleton"
      className="glass flex flex-col overflow-hidden rounded-[20px]"
    >
      <div className="h-40 shrink-0 animate-pulse bg-primary/10" />
      <div className="flex flex-col gap-3 p-5">
        <div className="h-4 w-3/4 animate-pulse rounded bg-primary/10" />
        <div className="h-3 w-full animate-pulse rounded bg-primary/10" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-primary/10" />
        <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-primary/10" />
      </div>
    </div>
  )
}
