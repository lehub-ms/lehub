import { useCallback, useEffect, useState } from 'react'
import { listUpcomingEvents, type EventSummary } from '@/lib/api'

export type UpcomingEventsState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'success'; events: EventSummary[] }

type Settled = { token: number } & ({ events: EventSummary[] } | { error: unknown })

/**
 * Fetches the upcoming events once per mount (plus on `refetch`). `EventsPage` and
 * `HomePage` each call this independently — the two pages are never mounted together in
 * this SPA, so there is no shared-cache layer to build.
 */
export function useUpcomingEvents(): UpcomingEventsState & { refetch: () => void } {
  const [reloadToken, setReloadToken] = useState(0)
  // "loading" is derived by comparing `settled.token` to `reloadToken` during render,
  // rather than set synchronously at the top of the effect — the effect only ever calls
  // setState from inside the fetch's own callbacks, after a real async boundary.
  const [settled, setSettled] = useState<Settled | null>(null)

  useEffect(() => {
    let cancelled = false

    listUpcomingEvents()
      .then((events) => {
        if (!cancelled) setSettled({ token: reloadToken, events })
      })
      .catch((error: unknown) => {
        if (!cancelled) setSettled({ token: reloadToken, error })
      })

    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const refetch = useCallback(() => {
    setReloadToken((token) => token + 1)
  }, [])

  if (!settled || settled.token !== reloadToken) {
    return { status: 'loading', refetch }
  }
  if ('error' in settled) {
    return { status: 'error', error: settled.error, refetch }
  }
  return { status: 'success', events: settled.events, refetch }
}
