import type { ReactNode } from 'react'
import { errorId, hintId } from '../../lib/fieldIds'

interface FieldProps {
  /** L'identifiant du contrôle décrit. Le label lui est rattaché, pas approximé. */
  htmlFor: string
  label: string
  hint?: string
  error?: string | null
  /** Rendu à droite du label, sur la même ligne — « Mot de passe oublié ? ». */
  action?: ReactNode
  children: ReactNode
}

/**
 * Un champ : son intitulé, son contrôle, et ce qui le décrit ou le refuse.
 *
 * Le message d'erreur porte `role="alert"` : il apparaît après coup, en réponse à une
 * soumission, et un lecteur d'écran doit l'annoncer sans que l'utilisateur ait à revenir
 * dessus. Le rattacher au contrôle par `aria-describedby` est le travail de l'appelant, à
 * qui `errorId` et `hintId` donnent les identifiants.
 */
export function Field({ htmlFor, label, hint, error, action, children }: FieldProps): ReactNode {
  return (
    <div className="mb-4">
      {action ? (
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor={htmlFor} className="block text-[0.8125rem] font-semibold text-ink">
            {label}
          </label>
          {action}
        </div>
      ) : (
        <label htmlFor={htmlFor} className="mb-1.5 block text-[0.8125rem] font-semibold text-ink">
          {label}
        </label>
      )}
      {children}
      {hint ? (
        <span id={hintId(htmlFor)} className="mt-1.5 block text-xs leading-relaxed text-ink-muted">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span
          id={errorId(htmlFor)}
          role="alert"
          className="mt-1.5 block text-xs leading-relaxed text-[#b91c1c]"
        >
          {error}
        </span>
      ) : null}
    </div>
  )
}
