import { useEffect, useState } from 'react'
import { FOOTER_ELEMENT_ID } from '@/components/Footer'

/**
 * De combien de pixels le pied de page mord sur le bas de la fenêtre.
 *
 * C'est ce dont l'encart ancré doit se relever pour ne jamais recouvrir le pied de page ni
 * disparaître dessous (#194).
 *
 * `IntersectionObserver` et non un écouteur de défilement : le recouvrement est calculé par le
 * navigateur, hors du fil principal, et n'est notifié qu'aux franchissements de seuil. Un
 * écouteur `scroll` obligerait à lire `getBoundingClientRect()` à chaque image — une lecture de
 * layout par frame, pendant un défilement, sur mobile. Les seuils rapprochés donnent une
 * remontée assez fine pour être continue à l'œil.
 *
 * Sans `IntersectionObserver`, le recouvrement reste nul et l'encart est simplement collé en bas
 * de la fenêtre : c'est le comportement d'aujourd'hui, pas une régression.
 */
const THRESHOLDS = Array.from({ length: 41 }, (_, index) => index / 40)

export function useFooterOverlap(enabled: boolean): number {
  const [overlap, setOverlap] = useState(0)

  useEffect(() => {
    if (!enabled) return

    const footer = document.getElementById(FOOTER_ELEMENT_ID)
    if (!footer) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        setOverlap(entry ? Math.round(entry.intersectionRect.height) : 0)
      },
      { threshold: THRESHOLDS },
    )
    observer.observe(footer)

    return () => {
      observer.disconnect()
    }
  }, [enabled])

  return enabled ? overlap : 0
}
