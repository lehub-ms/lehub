import { useEffect, useState } from 'react'
import { CalendarDays, MapPin, TriangleAlert } from 'lucide-react'
import { listUpcomingEvents, type EventSummary } from './lib/api'

type State =
  | { status: 'loading' }
  | { status: 'ready'; events: EventSummary[] }
  | { status: 'error'; message: string }

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'full',
  timeStyle: 'short',
})

function EventCard({ event }: { event: EventSummary }) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">{event.title}</h3>

      <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
        <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
        <time dateTime={event.startDate}>{dateFormat.format(new Date(event.startDate))}</time>
      </p>

      <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
        <MapPin aria-hidden="true" className="size-4 shrink-0" />
        {event.format} · {event.mode}
      </p>

      {event.description && <p className="mt-3 text-sm text-slate-700">{event.description}</p>}

      {event.technologies.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {event.technologies.map((technology) => (
            <li
              key={technology.id}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
            >
              {technology.name}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export function App() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let active = true
    listUpcomingEvents()
      .then((events) => active && setState({ status: 'ready', events }))
      .catch((error: unknown) =>
        active
          ? setState({
              status: 'error',
              message: error instanceof Error ? error.message : 'Erreur inconnue.',
            })
          : undefined,
      )
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="min-h-dvh bg-slate-50 font-sans">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">LeHub</h1>
          <p className="mt-1 text-slate-600">
            L&apos;agenda des communautés Microsoft francophones.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h2 className="text-xl font-semibold text-slate-900">Prochains évènements</h2>

        {state.status === 'loading' && (
          <p className="mt-4 text-slate-600">Chargement des évènements…</p>
        )}

        {state.status === 'error' && (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
          >
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <span>
              Impossible de charger les évènements. {state.message}
            </span>
          </p>
        )}

        {state.status === 'ready' &&
          (state.events.length === 0 ? (
            <p className="mt-4 text-slate-600">Aucun évènement à venir pour le moment.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {state.events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </ul>
          ))}
      </main>
    </div>
  )
}
