import { ArrowLeft } from 'lucide-react'
import { LinkButton } from '@/components/LinkButton'
import { PATHS } from '@/lib/navigation'

/**
 * Rendered by the `*` route, which is a child of the layout — so the header and the
 * footer stay visible and usable here, as stories #8 and #11 both require.
 */
export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-10 text-center">
      {/* Decoration: the <h1> below carries the real message. */}
      <p aria-hidden="true" className="text-gradient text-7xl font-bold tracking-tight">
        404
      </p>

      <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">Page introuvable</h1>

      <p className="mt-4 text-ink-muted text-pretty">
        La page que vous cherchez n’existe pas ou a été déplacée.
      </p>

      <LinkButton to={PATHS.home} className="mt-9">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Retour à l’accueil
      </LinkButton>
    </div>
  )
}
