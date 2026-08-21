import type { ReactNode } from 'react'
import * as Checkbox from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'

interface FilterCheckboxRowProps {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  /** A `CommunityAvatar` or a technology color swatch, injected by the caller. */
  leading: ReactNode
}

/** One filter option row, shared by the desktop panel and the mobile drawer. */
export function FilterCheckboxRow({ id, label, checked, onChange, leading }: FilterCheckboxRowProps) {
  const checkboxId = `filter-option-${id}`

  return (
    <label
      htmlFor={checkboxId}
      className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-2 transition-colors hover:bg-primary/5"
    >
      <Checkbox.Root
        id={checkboxId}
        checked={checked}
        onCheckedChange={(value) => {
          onChange(value === true)
        }}
        className="flex size-4 shrink-0 items-center justify-center rounded border border-slate-300 bg-white data-[state=checked]:border-primary data-[state=checked]:bg-primary"
      >
        <Checkbox.Indicator>
          <Check aria-hidden="true" className="size-2.5 text-white" strokeWidth={3} />
        </Checkbox.Indicator>
      </Checkbox.Root>
      {leading}
      <span className="min-w-0 flex-1 truncate text-sm text-ink-body">{label}</span>
    </label>
  )
}
