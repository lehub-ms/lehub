import { Calendar, CalendarCheck, Mail, UserPlus } from 'lucide-react'
import { BUTTON_BASE, BUTTON_VARIANTS } from '@/lib/button-styles'
import { cn } from '@/lib/cn'

const APPS = [
  { icon: Calendar, label: 'Apple Calendar' },
  { icon: Mail, label: 'Outlook' },
  { icon: CalendarCheck, label: 'Google Calendar' },
]

/**
 * Sells account creation from the home page, ahead of the auth flow (Epic #2) that
 * would make it work. The CTA stays `aria-disabled` rather than `disabled`: a real
 * `<button>` with no `onClick` is still reachable by keyboard and screen readers, and
 * Enter/Space do nothing — visible but inert, never a broken link to a route that
 * does not exist yet.
 */
export function CalendarCard() {
  return (
    <div className="glass-strong rounded-[20px] p-8">
      <div className="mb-7 flex items-center gap-3.5">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-light">
          <CalendarCheck aria-hidden="true" className="size-[26px] text-white" />
        </div>
        <div>
          <h2 className="font-heading text-lg leading-tight font-bold text-ink">
            Votre calendrier personnalisé
          </h2>
          <p className="mt-1 text-[0.8125rem] font-medium text-ink-muted">
            Vos évènements préférés s&rsquo;ajoutent automatiquement dans votre application de
            calendrier.
          </p>
        </div>
      </div>

      <p className="mb-7 text-base leading-relaxed text-ink-muted">
        Créez un compte, enregistrez vos préférences d&rsquo;évènements et obtenez une{' '}
        <strong className="font-semibold text-ink">URL de calendrier unique</strong> à
        synchroniser en un clic avec votre application de calendrier favorite.
      </p>

      <div className="mb-7 flex flex-wrap items-center gap-2.5">
        {APPS.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-1.5 rounded-lg border border-ink/10 bg-ink/5 px-3 py-1.5"
          >
            <Icon aria-hidden="true" className="size-4 text-ink-muted" />
            <span className="text-[0.8125rem] font-medium text-ink-muted">{label}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        aria-disabled="true"
        // Full opacity, not a dimmed style: opacity-60 over this glass card blended
        // white-on-blue down to ~2.8:1, well under the AA floor CLAUDE.md sets for any
        // text a focusable, still-labelled control exposes. "Disabled" is communicated
        // by cursor-not-allowed and the sr-only suffix below, not by contrast loss.
        className={cn(BUTTON_BASE, BUTTON_VARIANTS.primary, 'w-full cursor-not-allowed shadow-none hover:bg-primary')}
      >
        <UserPlus aria-hidden="true" className="size-4" />
        Créer un compte / Se connecter
        <span className="sr-only">— bientôt disponible</span>
      </button>
    </div>
  )
}
