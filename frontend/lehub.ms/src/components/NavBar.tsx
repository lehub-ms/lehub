import type { RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import * as Dialog from '@radix-ui/react-dialog'
import { Menu } from 'lucide-react'
import { cn } from '@shared/lib/cn'
import { NAV_ITEMS } from '@/lib/navigation'
import { AccountMenu } from './AccountMenu'
import { Wordmark } from './Wordmark'

/** Tailwind's `md` breakpoint. Below it the links collapse into the drawer. */
const DESKTOP_QUERY = '(min-width: 768px)'

const DESKTOP_LINK =
  'flex items-center rounded-full px-3.5 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-primary/5 hover:text-primary'

/* min-h-11 is the 44px touch target story #9 asks for on every drawer entry.
   text-ink-body rather than text-ink-muted: the panel is translucent over a dark
   scrim, and compositing drags the muted token down to 3.5:1 — below the AA floor.
   ink-body holds at 7.4:1 whatever the background mesh is doing underneath. */
const DRAWER_LINK =
  'flex min-h-11 items-center rounded-xl px-4 text-base font-medium text-ink-body transition-colors hover:bg-primary/5 hover:text-primary'

const ACTIVE_LINK = 'bg-primary-xs font-semibold text-primary'

interface SectionLinkProps {
  to: string
  label: string
  isActive: boolean
  className: string
  onClick?: () => void
  linkRef?: RefObject<HTMLAnchorElement | null>
}

/**
 * Deliberately a plain `Link` with an exact comparison rather than a `NavLink`.
 *
 * NavLink's matching mirrors the router's: `caseSensitive` defaults to false and a
 * trailing slash is optional. Both of those resolve to a 404 here, so NavLink would
 * paint "Évènements" as current — and announce `aria-current="page"` — on a page whose
 * heading reads "Page introuvable". The three sections are exact static paths, so
 * `pathname === to` is the whole of the matching we need.
 */
function SectionLink({ to, label, isActive, className, onClick, linkRef }: SectionLinkProps) {
  return (
    <Link
      ref={linkRef}
      to={to}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={cn(className, isActive && ACTIVE_LINK)}
    >
      {label}
    </Link>
  )
}

export function NavBar() {
  const [open, setOpen] = useState(false)
  const firstLinkRef = useRef<HTMLAnchorElement>(null)
  const { pathname } = useLocation()

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY)
    // Past the breakpoint the hamburger disappears. A drawer left open would then be
    // a modal with no visible way back and a focus trap the user cannot escape.
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false)
    }
    query.addEventListener('change', closeOnDesktop)
    return () => {
      query.removeEventListener('change', closeOnDesktop)
    }
  }, [])

  return (
    // The bar spans the viewport so the pill can be centred without a transform, but
    // only the pill itself catches pointer events.
    <header className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <nav
        aria-label="Navigation principale"
        className="glass pointer-events-auto flex max-w-full items-center gap-1 rounded-full p-1.5 backdrop-blur-2xl"
      >
        {/* Not a link: the mock-up makes the wordmark inert, and "Accueil" already
            leads home two items away. */}
        <span className="px-3 text-[1.0625rem] select-none">
          <Wordmark />
        </span>

        <ul className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <SectionLink
                to={item.to}
                label={item.label}
                isActive={pathname === item.to}
                className={DESKTOP_LINK}
              />
            </li>
          ))}
        </ul>

        <div className="hidden md:flex">
          <AccountMenu />
        </div>

        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            className="flex size-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-primary/5 hover:text-primary md:hidden"
          >
            <Menu aria-hidden="true" className="size-5" />
          </Dialog.Trigger>

          <Dialog.Portal>
            <Dialog.Overlay
              // The overlay carries no accessible role, so a test hook is the only way to
              // assert "clicking the dimmed backdrop closes the menu".
              data-testid="nav-backdrop"
              className="fixed inset-0 z-[290] bg-slate-900/50 backdrop-blur-sm"
            />
            <Dialog.Content
              // Radix confines assistive tech with aria-hidden on everything else rather
              // than with aria-modal. Story #9 asks for the dialog to be announced as
              // modal, so the attribute is stated explicitly; both mechanisms agree.
              aria-modal="true"
              // The drawer has no descriptive body, only links.
              aria-describedby={undefined}
              onOpenAutoFocus={(event) => {
                // Radix picks its initial focus target with
                // `focusFirst(removeLinks(getTabbableCandidates(container)))` — it
                // deliberately skips links. This drawer holds nothing but links, so
                // the default would focus the panel and story #9's criterion
                // ("focus moves to the first link") would silently fail.
                event.preventDefault()
                firstLinkRef.current?.focus()
              }}
              className="glass-strong fixed top-1/2 left-1/2 z-[300] max-h-[calc(100dvh-2rem)] w-[min(22.5rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[20px] p-8"
            >
              <Dialog.Title className="sr-only">Menu principal</Dialog.Title>
              <ul className="flex flex-col gap-1">
                {NAV_ITEMS.map((item, index) => (
                  <li key={item.to}>
                    <SectionLink
                      to={item.to}
                      label={item.label}
                      isActive={pathname === item.to}
                      className={DRAWER_LINK}
                      linkRef={index === 0 ? firstLinkRef : undefined}
                      onClick={() => {
                        setOpen(false)
                      }}
                    />
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex">
                <AccountMenu
                  className="w-full justify-center rounded-xl"
                  onNavigate={() => {
                    setOpen(false)
                  }}
                />
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </nav>
    </header>
  )
}
