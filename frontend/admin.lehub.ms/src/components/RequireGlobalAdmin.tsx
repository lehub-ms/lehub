import { ShieldOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { Outlet } from 'react-router'
import { useAuth } from '@lehub/shared/auth/useAuth'

/**
 * La garde de l'administration générale, calquée sur `RequireAccess` — avec une différence
 * qui n'est pas cosmétique.
 *
 * Elle **affiche le refus sur place** au lieu de rediriger vers `/acces-refuse`. Cet écran-là
 * s'adresse à un compte sans aucun accès au backoffice, et il porte sa propre garde,
 * `RequireNoAccess`, qui en renvoie toute session habilitée. Un organisateur y étant
 * parfaitement habilité, l'y envoyer le faisait rebondir vers l'accueil, donc vers les
 * évènements de sa communauté : le refus se transformait en navigation silencieuse.
 *
 * Comme `RequireAccess`, elle se monte **au-dessus** des écrans qu'elle protège : l'écran visé
 * n'est jamais monté, et ne peut donc rien divulguer — pas même son titre. Masquer l'entrée
 * dans la barre latérale n'est qu'un confort ; ceci en est la conséquence, et l'API reste
 * l'arbitre (#109).
 */
export function RequireGlobalAdmin(): ReactNode {
  const { state } = useAuth()

  if (state.status !== 'authenticated') return null

  if (!state.permissions.isGlobalAdmin) {
    return (
      <div className="mx-auto flex max-w-[30rem] flex-col items-center gap-3 rounded-2xl border border-primary/12 bg-white px-6 py-12 text-center">
        <ShieldOff aria-hidden="true" className="size-8 text-ink-muted" />
        <h1 className="text-xl font-bold">Section réservée aux administrateurs</h1>
        <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
          L'administration générale gère les référentiels partagés par toutes les communautés.
          Votre compte organise des communautés, ce qui ne donne pas accès à cette section.
        </p>
      </div>
    )
  }

  return <Outlet />
}
