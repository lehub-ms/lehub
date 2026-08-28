import { ExternalLink, LogOut, ShieldOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuth } from '@shared/auth/useAuth'
import { accountLabel } from '@shared/lib/accountLabel'
import { PUBLIC_SITE_URL } from '@/lib/navigation'

/**
 * Connecté, mais sans habilitation.
 *
 * Ni page vide, ni boucle de connexion, ni redirection muette vers le site public : l'écran
 * dit les trois choses qui manquent à quelqu'un qui vient de se heurter à une porte — qu'il
 * est bien identifié, qu'il n'a pas accès, et à qui s'adresser.
 *
 * C'est aussi l'écran d'un lien profond partagé à un compte non habilité : il ne laisse rien
 * filtrer de la page visée, puisqu'il la remplace avant qu'elle ne se monte.
 */
export function NoAccessPage(): ReactNode {
  const { state, signOut } = useAuth()
  const label = state.status === 'authenticated' ? accountLabel(state.user) : null

  return (
    <div className="mx-auto w-full max-w-[34rem] rounded-2xl border border-slate-900/10 bg-white p-8 shadow-[0_10px_30px_rgb(0_0_0/0.06)]">
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
        <ShieldOff aria-hidden="true" className="size-5" />
      </span>

      <h1 className="mt-5 font-heading text-2xl font-bold tracking-tight text-ink">
        Vous n’avez pas accès au backoffice
      </h1>

      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-body">
        Votre compte {label ? <strong className="text-ink">{label}</strong> : null} est bien
        connecté, mais il n’est ni administrateur de LeHub, ni organisateur d’une communauté.
      </p>

      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-body">
        L’accès se demande à un administrateur de LeHub, ou à un organisateur de la communauté
        que vous rejoignez : c’est lui qui vous désignera. Rien à faire de votre côté d’ici là.
      </p>

      <div className="mt-7 flex flex-wrap gap-3">
        <a
          href={PUBLIC_SITE_URL}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-cta px-5 text-sm font-semibold text-white transition-colors hover:bg-cta-dark"
        >
          Retourner sur lehub.ms
          <ExternalLink aria-hidden="true" className="size-4" />
        </a>
        <button
          type="button"
          onClick={signOut}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-900/15 px-5 text-sm font-medium text-ink transition-colors hover:border-primary hover:text-primary"
        >
          <LogOut aria-hidden="true" className="size-4" />
          Se déconnecter
        </button>
      </div>
    </div>
  )
}
