import type { ReactNode } from 'react'
import { Outlet } from 'react-router'
import { Wordmark } from './Wordmark'

/**
 * Le cadre des deux seuls écrans que l'on atteint sans session.
 *
 * Volontairement nu : pas de navigation, pas de pied de page, rien à explorer. Un visiteur qui
 * arrive ici n'a qu'une chose à faire, et l'écran ne lui en propose pas d'autre.
 */
export function AuthLayout(): ReactNode {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-12">
      <Wordmark className="text-2xl" />
      <main id="contenu" className="w-full max-w-[30rem]">
        <Outlet />
      </main>
    </div>
  )
}
