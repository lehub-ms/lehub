/**
 * Les classes partagées par les champs, sur le même patron que `button-styles.ts` : une
 * constante plutôt qu'une chaîne recopiée dans chaque composant, pour que la maquette n'ait
 * qu'un seul endroit où atterrir.
 *
 * L'anneau de focus n'y figure pas : `:focus-visible` est posé une fois pour toutes dans
 * `index.css` et vaut pour tout le site. Les champs se contentent de virer au primaire sur
 * leur bordure, ce qui se cumule proprement avec lui.
 */
export const INPUT_BASE =
  'w-full rounded-[10px] border-[1.5px] border-[#e2e8f0] bg-white px-3.5 py-3 text-[0.9375rem] text-ink transition-colors placeholder:text-[#94a3b8] hover:border-[#cbd5e1] focus:border-primary aria-invalid:border-[#b91c1c]'

/** 48px de haut : au-dessus du plancher tactile de 44px, comme la maquette. */
export const BUTTON_BLOCK =
  'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-[0.9375rem] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60'

export const BUTTON_BLOCK_PRIMARY =
  'bg-primary text-white shadow-[0_4px_14px_rgb(0_95_184/0.35)] hover:not-disabled:-translate-y-px hover:not-disabled:bg-primary-dark hover:not-disabled:shadow-[0_6px_20px_rgb(0_95_184/0.45)]'
