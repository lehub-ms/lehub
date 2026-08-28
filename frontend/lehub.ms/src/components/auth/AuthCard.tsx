import type { ReactNode } from 'react'

/**
 * La carte de verre qui porte chacun des états d'authentification.
 *
 * Une seule carte pour tout le parcours, comme la maquette : l'utilisateur ne change pas de
 * décor entre le formulaire et la saisie du code, seul le contenu de la carte change.
 */
export function AuthCard({
  titleId,
  title,
  subtitle,
  children,
}: {
  titleId: string
  title: string
  subtitle: ReactNode
  children: ReactNode
}): ReactNode {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <section
        aria-labelledby={titleId}
        className="glass-strong w-full max-w-[30rem] rounded-3xl px-9 py-10 shadow-[0_10px_40px_rgb(0_95_184/0.12)] max-sm:px-6 max-sm:py-7"
      >
        <div className="mb-7 text-center">
          <h1 id={titleId} className="mb-2 text-[1.625rem] font-bold max-sm:text-[1.375rem]">
            {title}
          </h1>
          <p className="text-[0.9375rem] leading-normal text-ink-muted">{subtitle}</p>
        </div>
        {children}
      </section>
    </div>
  )
}
