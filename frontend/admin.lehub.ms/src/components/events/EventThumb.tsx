import type { ReactNode } from 'react'
import { ImageOff } from 'lucide-react'

interface EventThumbProps {
  bannerImageUrl: string | null
}

/**
 * La vignette de bannière d'une ligne d'évènement, ou son repli.
 *
 * « Un évènement sans bannière affiche un repli, jamais une image cassée ni un vide » (#144) :
 * l'absence est donc **rendue**, pas omise. Le cadre garde ses dimensions dans les deux cas, ce
 * qui évite qu'une liste mêlant les deux ait des lignes de hauteurs différentes.
 *
 * `alt=""` et `aria-hidden` sur le repli : la bannière est décorative, le titre juste à côté
 * porte l'information. C'est la même décision que #148 prend pour la page publique, et une
 * alternative textuelle ici ferait lire deux fois le nom de l'évènement.
 *
 * Le ratio 16/9 de la maquette est conservé (56 × 36 ≈ 1,56) : c'est le format que le champ de
 * dépôt annonce, et une vignette d'un autre ratio ferait mentir l'aperçu.
 */
export function EventThumb({ bannerImageUrl }: EventThumbProps): ReactNode {
  if (!bannerImageUrl) {
    return (
      <span
        aria-hidden="true"
        className="flex h-9 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-primary/12 bg-surface-subtle text-ink-muted"
      >
        <ImageOff className="size-4" />
      </span>
    )
  }

  return (
    <span className="flex h-9 w-14 shrink-0 overflow-hidden rounded-lg border border-primary/12 bg-white">
      <img src={bannerImageUrl} alt="" className="size-full object-cover" />
    </span>
  )
}
