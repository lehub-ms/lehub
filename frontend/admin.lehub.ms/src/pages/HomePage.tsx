import type { ReactNode } from 'react'
import { useAuth } from '@lehub/shared/auth/useAuth'
import { accountLabel } from '@lehub/shared/lib/accountLabel'

/**
 * L'accueil provisoire d'un compte habilité.
 *
 * La Feature #138 remplace cet écran par la coquille du backoffice — barre latérale, sélecteur
 * de communauté, compte connecté — et l'entrée mènera alors aux évènements de la première
 * communauté du sélecteur. En attendant, cet écran ne fait qu'une chose : confirmer que la
 * porte s'est ouverte, sans promettre des sections qui n'existent pas encore.
 */
export function HomePage(): ReactNode {
  const { state } = useAuth()
  if (state.status !== 'authenticated') return null

  const communities = state.permissions.organizedCommunityIds.length

  return (
    <div className="mx-auto w-full max-w-[34rem] rounded-2xl border border-slate-900/10 bg-white p-8 shadow-[0_10px_30px_rgb(0_0_0/0.06)]">
      <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">
        Bonjour {accountLabel(state.user)}
      </h1>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-body">
        {state.permissions.isGlobalAdmin
          ? 'Vous êtes administrateur de LeHub.'
          : `Vous organisez ${String(communities)} communauté${communities > 1 ? 's' : ''}.`}
      </p>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
        Les écrans de gestion arrivent avec les prochaines livraisons.
      </p>
    </div>
  )
}
