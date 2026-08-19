import { useEffect, useState } from 'react'
import { CircleCheck, Lock, TriangleAlert } from 'lucide-react'
import { getHealth, type HealthStatus } from './lib/api'

type State =
  | { status: 'loading' }
  | { status: 'ready'; health: HealthStatus }
  | { status: 'error'; message: string }

export function App() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let active = true
    getHealth()
      .then((health) => active && setState({ status: 'ready', health }))
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
    <div className="min-h-dvh bg-slate-100 font-sans">
      <header className="border-b border-slate-300 bg-slate-900">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <h1 className="text-3xl font-bold tracking-tight text-white">LeHub — administration</h1>
          <p className="mt-1 text-slate-300">Backoffice des organisateurs de communautés.</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <section
          aria-labelledby="acces-titre"
          className="rounded-lg border border-amber-300 bg-amber-50 p-5"
        >
          <h2
            id="acces-titre"
            className="flex items-center gap-2 text-lg font-semibold text-amber-900"
          >
            <Lock aria-hidden="true" className="size-5 shrink-0" />
            Accès réservé
          </h2>
          <p className="mt-2 text-sm text-amber-900">
            L&apos;authentification n&apos;est pas encore branchée. Chaque route
            d&apos;administration est protégée côté API par le rôle applicatif porté par le jeton
            Entra : ce que cet écran affiche ou masque n&apos;est jamais une décision de sécurité.
          </p>
        </section>

        <section aria-labelledby="api-titre">
          <h2 id="api-titre" className="text-xl font-semibold text-slate-900">
            État de l&apos;API
          </h2>

          {state.status === 'loading' && <p className="mt-4 text-slate-600">Vérification…</p>}

          {state.status === 'error' && (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
            >
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <span>API injoignable. {state.message}</span>
            </p>
          )}

          {state.status === 'ready' && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-5">
              <p className="flex items-center gap-2 font-medium text-emerald-700">
                <CircleCheck aria-hidden="true" className="size-5 shrink-0" />
                API disponible
              </p>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-slate-700">
                <dt className="font-medium">Base de données configurée</dt>
                <dd>{state.health.sqlConfigured ? 'oui' : 'non'}</dd>
                <dt className="font-medium">Horodatage</dt>
                <dd>
                  <time dateTime={state.health.timestamp}>{state.health.timestamp}</time>
                </dd>
              </dl>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
