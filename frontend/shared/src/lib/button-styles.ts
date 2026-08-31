type Variant = 'primary' | 'outline'

/** Shared between `LinkButton` (a real `Link`) and `CalendarCard`'s disabled CTA
    (a `<button>` that must look the same without navigating anywhere). */
export const BUTTON_BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-6 text-[0.9375rem] font-semibold transition-colors'

export const BUTTON_VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white shadow-[0_4px_14px_rgb(0_95_184/0.35)] hover:bg-primary-dark',
  outline: 'border-[1.5px] border-primary/35 text-primary hover:border-primary hover:bg-primary-xs',
}
