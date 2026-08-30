import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, ExternalLink, LogOut, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuth } from '@lehub/shared/auth/useAuth'
import { accountLabel } from '@lehub/shared/lib/accountLabel'
import { cn } from '@lehub/shared/lib/cn'
import { accountInitials } from '@/lib/accountInitials'
import { PUBLIC_SITE_URL } from '@/lib/navigation'

const ITEM =
  'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-sm text-ink-body outline-none transition-colors select-none data-highlighted:bg-primary-xs data-highlighted:text-primary'

/**
 * Le bas de la barre latérale : sous quelle identité et à quel titre on est connecté, et le
 * seul menu de l'application.
 *
 * Le libellé vient d'`accountLabel` et les initiales d'`accountInitials`, qui ne reçoivent l'un
 * comme l'autre qu'un prénom et un nom — l'adresse email n'a aucun chemin jusqu'ici, et un test
 * l'asserte sur le rendu entier de la barre plutôt que sur ce seul bloc.
 */
export function AccountBlock({ collapsed }: { collapsed: boolean }): ReactNode {
  const { state, signOut } = useAuth()

  if (state.status !== 'authenticated') return null

  const label = accountLabel(state.user)
  const initials = accountInitials(state.user)
  // La qualité la plus large l'emporte : un compte à la fois administrateur et organisateur
  // est annoncé comme administrateur.
  const role = state.permissions.isGlobalAdmin ? 'Administrateur' : 'Organisateur'

  return (
    <div className="border-t border-primary/12 p-3">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className={cn(
            'flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl p-2 text-left transition-colors hover:bg-primary-xs',
            collapsed && 'justify-center',
          )}
          // Réduite, la barre ne montre que les initiales : le nom et la qualité restent dans
          // le nom accessible du déclencheur.
          aria-label={`${label}, ${role}. Ouvrir le menu du compte`}
          title={collapsed ? `${label} — ${role}` : undefined}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-primary to-primary-light font-heading text-[0.8125rem] font-bold text-white">
            {initials ?? <UserRound aria-hidden="true" className="size-4" />}
          </span>
          {collapsed ? null : (
            <>
              <span className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {/* `truncate` : un nom très long rétrécit au lieu de pousser le bloc hors de
                    la barre, et reste entier dans le nom accessible du déclencheur. */}
                <span className="truncate text-sm font-semibold text-ink">{label}</span>
                <span className="truncate text-xs text-ink-muted">{role}</span>
              </span>
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
            </>
          )}
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="start"
            sideOffset={8}
            className="z-[400] min-w-[13rem] rounded-xl border border-primary/12 bg-white p-1.5 shadow-[0_10px_30px_rgb(0_0_0/0.12)]"
          >
            <DropdownMenu.Item asChild className={ITEM}>
              {/* L'adresse vient de la configuration de l'environnement : écrite en dur, elle
                  ne vaudrait que dans un environnement à la fois. C'est le pendant de l'entrée
                  « Portail de gestion » que la navigation publique a reçue avec #137 — les deux
                  applications cessent d'être deux impasses l'une pour l'autre. */}
              <a href={PUBLIC_SITE_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" className="size-4" />
                Aller sur lehub.ms
                <span className="sr-only">— s'ouvre dans un nouvel onglet</span>
              </a>
            </DropdownMenu.Item>

            <DropdownMenu.Item className={ITEM} onSelect={signOut}>
              <LogOut aria-hidden="true" className="size-4" />
              Se déconnecter
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}
