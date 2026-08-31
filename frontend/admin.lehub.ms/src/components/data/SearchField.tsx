import { useId, useRef, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@lehub/shared/lib/cn'
import { INPUT_BASE } from '@lehub/shared/lib/form-styles'

interface SearchFieldProps {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}

/**
 * Le champ de recherche d'une table.
 *
 * L'étiquette existe et n'est que visuellement masquée : une loupe n'est pas un nom accessible,
 * et un champ que rien ne nomme s'annonce « zone de texte » et rien d'autre.
 *
 * Le bouton d'effacement rend le focus au champ — « se vide d'un geste » (#151) ne doit pas
 * coûter une tabulation de retour pour recommencer à taper.
 */
export function SearchField({ label, placeholder, value, onChange }: SearchFieldProps): ReactNode {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)

  return (
    <div className="relative w-full max-w-sm">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-ink-muted"
      />
      <input
        ref={input}
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value)
        }}
        className={cn(INPUT_BASE, 'pl-10', value && 'pr-10')}
      />
      {value ? (
        <button
          type="button"
          aria-label="Effacer la recherche"
          onClick={() => {
            onChange('')
            input.current?.focus()
          }}
          className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted transition-colors hover:text-ink"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  )
}
