import { Check, Circle, Eye, EyeOff } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { INPUT_BASE } from '../../lib/form-styles'
import { PASSWORD_RULES, passwordScore } from '../../lib/passwordRules'

interface PasswordInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  placeholder?: string
  describedBy?: string
  invalid?: boolean
  /** Affiche la jauge et les exigences. Réservé aux champs qui *créent* un mot de passe. */
  withGuidance?: boolean
  disabled?: boolean
}

export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
  describedBy,
  invalid,
  withGuidance,
  disabled,
}: PasswordInputProps): ReactNode {
  const [revealed, setRevealed] = useState(false)
  const guidanceId = useId()
  const Icon = revealed ? EyeOff : Eye
  const score = passwordScore(value)

  return (
    <>
      <div className="relative">
        <input
          id={id}
          type={revealed ? 'text' : 'password'}
          className={cn(INPUT_BASE, 'pr-12')}
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
          }}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={invalid ?? undefined}
          aria-describedby={[describedBy, withGuidance ? guidanceId : null].filter(Boolean).join(' ') || undefined}
          disabled={disabled}
          required
        />
        <button
          type="button"
          onClick={() => {
            setRevealed((shown) => !shown)
          }}
          // 44px de côté : la cible tactile prime sur la discrétion de l'icône.
          className="absolute top-1/2 right-1.5 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-primary/6 hover:text-primary"
          aria-label={revealed ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          aria-pressed={revealed}
        >
          <Icon aria-hidden="true" className="size-[18px]" />
        </button>
      </div>

      {withGuidance ? (
        <>
          <div className="mt-2 flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((bar) => (
              <span
                key={bar}
                className={cn(
                  'h-1 flex-1 rounded-sm transition-colors',
                  score >= bar + 1 ? 'bg-primary' : 'bg-[#e2e8f0]',
                )}
              />
            ))}
          </div>
          {/* `aria-live="polite"` : les règles se cochent pendant la frappe, et l'annonce
              doit attendre une pause plutôt que couper l'utilisateur à chaque caractère. */}
          <ul
            id={guidanceId}
            aria-live="polite"
            className="mt-2.5 rounded-lg border border-primary/12 bg-primary/5 px-3 py-2.5 text-xs leading-relaxed"
          >
            {PASSWORD_RULES.map((rule) => {
              const met = rule.test(value)
              const Mark = met ? Check : Circle
              return (
                <li
                  key={rule.id}
                  className={cn('flex items-center gap-1.5', met ? 'text-[#047857]' : 'text-ink-muted')}
                >
                  <Mark aria-hidden="true" className="size-3 shrink-0" />
                  {rule.label}
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
    </>
  )
}
