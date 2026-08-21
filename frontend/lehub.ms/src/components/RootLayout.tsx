import { Outlet, ScrollRestoration, useLocation } from 'react-router'
import { BackgroundMesh } from './BackgroundMesh'
import { NavBar } from './NavBar'
import { Footer } from './Footer'
import { PATHS } from '@/lib/navigation'
import { NotFoundPage } from '@/pages/NotFoundPage'

const SKIP_LINK =
  'sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-full focus:bg-white focus:px-5 focus:font-semibold focus:text-primary focus:shadow-lg'

function StrictPathOutlet() {
  const { pathname } = useLocation()
  // React Router compiles every pattern with a trailing `\/*$` (compilePath), so
  // "/evenements/" matches "/evenements". Story #8's stated default is that a URL not
  // strictly equal to a canonical path is a 404, so the trailing slash is rejected here
  // rather than redirected: no extra history entry, and the address bar keeps showing
  // what was actually requested.
  const hasTrailingSlash = pathname !== PATHS.home && pathname.endsWith('/')
  return hasTrailingSlash ? <NotFoundPage /> : <Outlet />
}

/**
 * The shell every public page renders inside: decorative mesh, skip link, header,
 * main landmark and footer. Because the 404 route is a child of this layout, the
 * navigation and the footer are present there too, by construction.
 */
export function RootLayout() {
  return (
    <>
      <a href="#contenu" className={SKIP_LINK}>
        Aller au contenu principal
      </a>

      <BackgroundMesh />
      <NavBar />

      {/* pt-20/pt-28 = 80px/112px, the offset that keeps content clear of the fixed
          navigation pill. Revisit both if the pill's height changes. */}
      <main id="contenu" className="relative z-10 flex-1 px-6 pt-20 pb-16 md:pt-28">
        <div className="mx-auto w-full max-w-[75rem]">
          <StrictPathOutlet />
        </div>
      </main>

      <Footer />

      {/* Resets the scroll offset on navigation and restores it on back/forward.
          Emits no inline script in library mode, so `script-src 'self'` is safe. */}
      <ScrollRestoration />
    </>
  )
}
