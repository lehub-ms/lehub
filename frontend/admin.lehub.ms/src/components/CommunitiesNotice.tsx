import { AlertCircle, Building2, RotateCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuth } from '@lehub/shared/auth/useAuth'
import { useCommunitiesValue } from '@/community/useAllowedCommunities'
import { BUTTON_BLOCK, BUTTON_BLOCK_PRIMARY } from '@lehub/shared/lib/form-styles'
import { cn } from '@lehub/shared/lib/cn'

/**
 * Les deux cas où la section communauté n'a rien à montrer, dits plutôt que tus.
 *
 * `empty` n'est pas un refus : le compte est bien habilité, c'est le référentiel qui est vide
 * — un administrateur global sur une base neuve. Le renvoyer à l'écran d'absence d'accès
 * serait un mensonge.
 */
export function CommunitiesNotice({ kind }: { kind: 'error' | 'empty' }): ReactNode {
  const { state } = useAuth()
  const { retry } = useCommunitiesValue()
  const Icon = kind === 'error' ? AlertCircle : Building2

  // Un organisateur ne peut pas atteindre l'administration générale : l'y envoyer serait un
  // cul-de-sac. Le message dit donc à qui s'adresser plutôt que quoi faire.
  const isGlobalAdmin = state.status === 'authenticated' && state.permissions.isGlobalAdmin
  return (
    <div className="mx-auto flex max-w-[30rem] flex-col items-center gap-3 rounded-2xl border border-primary/12 bg-white px-6 py-12 text-center">
      <Icon aria-hidden="true" className="size-8 text-ink-muted" />
      <h1 className="text-xl font-bold">
        {kind === 'error' ? 'Communautés indisponibles' : 'Aucune communauté'}
      </h1>
      <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
        {kind === 'error'
          ? "La liste des communautés n'a pas pu être chargée."
          : isGlobalAdmin
            ? "Aucune communauté n'est encore référencée. Créez-en une depuis l'administration générale."
            : "Aucune communauté ne vous est encore confiée. Demandez à un administrateur de LeHub de vous désigner organisateur."}
      </p>
      {kind === 'error' ? (
        <button type="button" onClick={retry} className={cn(BUTTON_BLOCK, BUTTON_BLOCK_PRIMARY, 'mt-1 w-auto')}>
          <RotateCw aria-hidden="true" className="size-4" />
          Réessayer
        </button>
      ) : null}
    </div>
  )
}
