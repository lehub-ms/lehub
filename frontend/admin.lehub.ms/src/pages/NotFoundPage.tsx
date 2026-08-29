import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { PATHS } from '@/lib/navigation'

export function NotFoundPage(): ReactNode {
  return (
    <div className="mx-auto w-full max-w-[34rem] rounded-2xl border border-slate-900/10 bg-white p-8 shadow-[0_10px_30px_rgb(0_0_0/0.06)]">
      <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">Page introuvable</h1>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-body">
        Cette adresse ne correspond à aucun écran du backoffice.
      </p>
      <Link
        to={PATHS.home}
        className="mt-6 inline-flex min-h-11 items-center rounded-full bg-cta px-5 text-sm font-semibold text-white transition-colors hover:bg-cta-dark"
      >
        Revenir à l’accueil
      </Link>
    </div>
  )
}
