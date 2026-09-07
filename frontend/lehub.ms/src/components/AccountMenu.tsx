import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, ExternalLink, LogOut, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@lehub/shared/auth/useAuth'
import { hasBackofficeAccess } from '@lehub/shared/lib/access'
import { accountLabel } from '@lehub/shared/lib/accountLabel'
import { cn } from '@lehub/shared/lib/cn'
import { ADMIN_BASE_URL, PATHS } from '@/lib/navigation'

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
  // Proposer une porte qui se refermerait sur un écran d'absence d'accès serait pire que ne
  // rien proposer : l'entrée n'apparaît que pour qui le backoffice laissera entrer. Ce n'est
  // pas la décision de sécurité pour autant — le backoffice arbitre lui-même à l'arrivée.
  const managesSomething = hasBackofficeAccess(state.permissions)

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
          <DropdownMenu.Item asChild className={ITEM}>
            <Link to={PATHS.profile} onClick={onNavigate}>
              <UserRound aria-hidden="true" className="size-4" />
              Mon profil
            </Link>
          </DropdownMenu.Item>

          {managesSomething ? (
            <DropdownMenu.Item asChild className={ITEM}>
              <a
                href={ADMIN_BASE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onNavigate}
              >
                <ExternalLink aria-hidden="true" className="size-4" />
                Portail de gestion
                <span className="sr-only">— s’ouvre dans un nouvel onglet</span>
              </a>
            </DropdownMenu.Item>
          ) : null}

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
