import { AlertCircle, Building2 } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Les deux cas où la section communauté n'a rien à montrer, dits plutôt que tus.
 *
 * `empty` n'est pas un refus : le compte est bien habilité, c'est le référentiel qui est vide
 * — un administrateur global sur une base neuve. Le renvoyer à l'écran d'absence d'accès
 * serait un mensonge.
 */
export function CommunitiesNotice({ kind }: { kind: 'error' | 'empty' }): ReactNode {
  const Icon = kind === 'error' ? AlertCircle : Building2
  return (
    <div className="mx-auto flex max-w-[30rem] flex-col items-center gap-3 rounded-2xl border border-primary/12 bg-white px-6 py-12 text-center">
      <Icon aria-hidden="true" className="size-8 text-ink-muted" />
      <h1 className="text-xl font-bold">
        {kind === 'error' ? 'Communautés indisponibles' : 'Aucune communauté'}
      </h1>
      <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
        {kind === 'error'
          ? "La liste des communautés n'a pas pu être chargée. Réessayez dans quelques instants."
          : "Aucune communauté n'est encore référencée. Créez-en une depuis l'administration générale."}
      </p>
    </div>
  )
}
