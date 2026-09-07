import { Wordmark } from './Wordmark'
import { GitHubIcon, LinkedInIcon } from './BrandIcons'
import { GITHUB_URL, LINKEDIN_URL } from '@/lib/external-links'

const EXTERNAL_LINK =
  'inline-flex size-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-primary/5 hover:text-primary'

/**
 * Repéré par un identifiant plutôt que par `document.querySelector('footer')` : l'encart de
 * préférences observe cet élément pour se relever au-dessus de lui (#194), et un sélecteur de
 * balise désignerait le premier `<footer>` venu le jour où un autre apparaîtrait.
 */
export const FOOTER_ELEMENT_ID = 'pied-de-page'

/**
 * Present on every public page, including the 404 — it is rendered by the layout, not
 * by the pages, so a route cannot forget it.
 */
export function Footer() {
  return (
    <footer
      id={FOOTER_ELEMENT_ID}
      className="relative z-10 border-t border-white/70 bg-white/40 backdrop-blur-md"
    >
      <div className="mx-auto flex w-full max-w-[75rem] flex-wrap items-center justify-between gap-4 px-6 py-6">
        <Wordmark className="text-xl" />

        <nav aria-label="Liens externes" className="flex items-center gap-2">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LeHub sur GitHub — nouvel onglet"
            className={EXTERNAL_LINK}
          >
            <GitHubIcon className="size-5" />
          </a>
          <a
            href={LINKEDIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Théophile CHIN-NIN sur LinkedIn — nouvel onglet"
            className={EXTERNAL_LINK}
          >
            <LinkedInIcon className="size-5" />
          </a>
        </nav>
      </div>
    </footer>
  )
}
