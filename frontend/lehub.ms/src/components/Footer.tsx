import { Wordmark } from './Wordmark'
import { GitHubIcon, LinkedInIcon } from './BrandIcons'
import { GITHUB_URL, LINKEDIN_URL } from '@/lib/external-links'

const EXTERNAL_LINK =
  'inline-flex size-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-primary/5 hover:text-primary'

/**
 * Present on every public page, including the 404 — it is rendered by the layout, not
 * by the pages, so a route cannot forget it.
 */
export function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/70 bg-white/40 backdrop-blur-md">
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
