import type { ReactNode } from 'react'
import { Outlet } from 'react-router'
import { BackgroundMesh } from '@lehub/shared/components/BackgroundMesh'
import { Wordmark } from './Wordmark'

/**
 * Le cadre des deux seuls écrans que l'on atteint sans session.
 *
 * Volontairement nu : pas de navigation, pas de pied de page, rien à explorer. Un visiteur qui
 * arrive ici n'a qu'une chose à faire, et l'écran ne lui en propose pas d'autre.
 *
 * Le maillage vient du socle partagé, comme sur le site public : la carte de `AuthCard` est une
 * surface de verre, et une surface de verre posée sur un fond uni n'a rien à flouter.
 */
export function AuthLayout(): ReactNode {
  return (
    <>
      <BackgroundMesh />
      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-12">
        <Wordmark className="text-2xl" />
        <main id="contenu" className="w-full max-w-[30rem]">
          <Outlet />
        </main>
      </div>
    </>
  )
}
