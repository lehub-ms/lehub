import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { accountLabel } from '@/lib/accountLabel'
import { cn } from '@/lib/cn'
import { PATHS } from '@/lib/navigation'

/**
 * Le point d'entrée compte : « Me connecter » hors session, l'identité en session.
 *
 * La règle la plus importante de ce composant est ce qu'il **ne** rend jamais : une chaîne
 * contenant `@`. Le libellé vient de `accountLabel`, qui ne reçoit qu'un prénom et un nom —
 * voir ce module pour le raisonnement.
 */
const ITEM =
  'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-sm text-ink-body outline-none transition-colors select-none data-highlighted:bg-primary/6 data-highlighted:text-primary'

export function AccountMenu({ className, onNavigate }: { className?: string; onNavigate?: () => void }): ReactNode {
  const { state, signOut } = useAuth()

  // Pendant la restauration, on ne montre rien plutôt que « Me connecter » : afficher le
  // mauvais état une fraction de seconde est pire que n'afficher aucun des deux.
  if (state.status === 'loading') return null

  if (state.status === 'anonymous') {
    return (
      <Link
        to={PATHS.signIn}
        onClick={onNavigate}
        className={cn(
          'inline-flex min-h-11 items-center rounded-full bg-cta px-5 text-sm font-semibold text-white transition-colors hover:bg-cta-dark',
          className,
        )}
      >
        Me connecter
      </Link>
    )
  }

  const label = accountLabel(state.user)

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          'inline-flex min-h-11 max-w-[12rem] items-center gap-1.5 rounded-full border border-slate-900/15 px-4 text-sm font-medium text-ink transition-colors hover:border-primary hover:text-primary',
          className,
        )}
      >
        {/* `truncate` plutôt qu'un retour à la ligne : un nom très long doit rétrécir, pas
            pousser la pilule de navigation hors de l'écran. */}
        <span className="truncate">{label}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-[400] min-w-[12.5rem] rounded-xl border border-slate-900/12 bg-white p-1.5 shadow-[0_10px_30px_rgb(0_0_0/0.12)]"
        >
          {/* #103 livrera la page. En attendant, l'entrée est là comme la story l'exige,
              sans mener à une 404 — même arbitrage que le CTA de la page d'accueil avant
              que l'inscription n'existe. */}
          <DropdownMenu.Item disabled className={cn(ITEM, 'text-ink-muted data-disabled:cursor-default')}>
            <UserRound aria-hidden="true" className="size-4" />
            Mon profil
            <span className="sr-only">— bientôt disponible</span>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={ITEM}
            onSelect={() => {
              onNavigate?.()
              signOut()
            }}
          >
            <LogOut aria-hidden="true" className="size-4" />
            Se déconnecter
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
