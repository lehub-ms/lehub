import { useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface OtpInputProps {
  /** Longueur annoncée par le tenant dans `code_length`, jamais devinée. */
  length: number
  label: string
  disabled?: boolean
  /**
   * Appelé dès que la dernière case est remplie, **avec la valeur fraîche**.
   *
   * C'est tout l'intérêt du paramètre. Dans le legacy, le gestionnaire relisait l'état React
   * au moment de la soumission ; cet état n'était pas encore appliqué, la valeur lue était
   * donc celle d'avant la dernière frappe, et l'écran répondait « entrez le code » à
   * l'instant précis où le dernier chiffre venait d'être saisi. Ici la valeur est calculée
   * localement et transmise, sans jamais transiter par l'état.
   */
  onComplete: (code: string) => void
  /** Appelé à chaque frappe, pour effacer un message affiché par la tentative précédente. */
  onType?: () => void
}

/**
 * Le composant n'observe pas les changements de `length` : l'appelant lui pose une `key`
 * dérivée de la longueur, ce qui le remonte à neuf. Un effet qui remettrait les cases à zéro
 * ferait la même chose en moins clair, et un rendu plus tard.
 */
export function OtpInput({ length, label, disabled, onComplete, onType }: OtpInputProps): ReactNode {
  const [digits, setDigits] = useState<string[]>(() => Array<string>(length).fill(''))
  const cells = useRef<(HTMLInputElement | null)[]>([])

  const apply = (next: string[], focusIndex: number): void => {
    // Lu avant l'écriture : ce qui déclenche la soumission, c'est le passage d'incomplet à
    // complet, pas le fait d'être complet. Sans cette nuance, corriger un seul caractère d'un
    // code refusé re-soumettrait aussitôt le code entier — celui d'avant, toujours faux — et
    // brûlerait une tentative de plus vers le verrouillage du compte à chaque frappe.
    const wasIncomplete = digits.some((digit) => digit === '')

    setDigits(next)
    cells.current[Math.min(focusIndex, length - 1)]?.focus()
    if (wasIncomplete && next.every((digit) => digit !== '')) onComplete(next.join(''))
  }

  const handleChange = (index: number, raw: string): void => {
    onType?.()
    const typed = raw.replace(/\D/g, '')
    if (typed === '') {
      const next = [...digits]
      next[index] = ''
      setDigits(next)
      return
    }
    // Une saisie multiple — collage dans une case, saisie automatique du code par le
    // navigateur — remplit les cases suivantes plutôt que d'être tronquée à un caractère.
    const next = [...digits]
    for (let offset = 0; offset < typed.length && index + offset < length; offset += 1) {
      next[index + offset] = typed[offset] ?? ''
    }
    apply(next, index + typed.length)
  }

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Backspace' && digits[index] === '' && index > 0) {
      event.preventDefault()
      const next = [...digits]
      next[index - 1] = ''
      setDigits(next)
      cells.current[index - 1]?.focus()
      return
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      cells.current[index - 1]?.focus()
    }
    if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault()
      cells.current[index + 1]?.focus()
    }
  }

  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>): void => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '')
    if (pasted === '') return
    event.preventDefault()
    handleChange(index, pasted)
  }

  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-1.5 block text-[0.8125rem] font-semibold text-ink">{label}</legend>
      <div className="my-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${String(length)}, minmax(0, 1fr))` }}>
        {digits.map((digit, index) => (
          <input
            // Les cases n'ont pas d'autre identité que leur position : elle est stable, et
            // c'est bien la position qui indexe la valeur.
            key={index}
            ref={(element) => {
              cells.current[index] = element
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={length}
            value={digit}
            disabled={disabled}
            onChange={(event) => {
              handleChange(index, event.target.value)
            }}
            onKeyDown={(event) => {
              handleKeyDown(index, event)
            }}
            onPaste={(event) => {
              handlePaste(index, event)
            }}
            onFocus={(event) => {
              event.target.select()
            }}
            aria-label={`Caractère ${String(index + 1)} sur ${String(length)}`}
            className={cn(
              'h-14 w-full min-w-0 rounded-xl border border-primary/12 bg-white text-center text-2xl font-semibold tabular-nums text-ink transition-colors',
              'focus:border-primary disabled:bg-[#f4f4f5] disabled:text-[#9ca3af]',
              'max-[460px]:h-12 max-[460px]:text-xl',
            )}
          />
        ))}
      </div>
    </fieldset>
  )
}
