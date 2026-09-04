import { useCallback, useSyncExternalStore } from 'react'

/**
 * Le seuil sous lequel la barre de préférences quitte le flux (#194).
 *
 * `1023.98px` et non `1024px` : les deux bornes doivent se compléter sans se chevaucher, et
 * `lg:` de Tailwind s'ouvre à `1024px` — un `max-width: 1024px` ferait donc coexister la barre en
 * flux et son ancrage exactement à cette largeur.
 *
 * Exporté parce que le stub `matchMedia` des tests s'y branche : la requête est écrite une fois,
 * et le stub ne peut pas dériver de ce que le composant interroge.
 */
export const NARROW_MEDIA_QUERY = '(max-width: 1023.98px)'

/**
 * `useSyncExternalStore` plutôt qu'un `useState` semé depuis un effet : la valeur est lue au
 * rendu, donc il n'existe aucune image où la barre serait dans le mauvais régime avant de se
 * corriger — ce qui, sur un encart ancré, se verrait.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => {
        list.removeEventListener('change', onChange)
      }
    },
    [query],
  )

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // Rendu hors navigateur : le régime au large est celui qui ne dépend d'aucune mesure.
    () => false,
  )
}
