/**
 * L'état réduit de la barre latérale, conservé d'un écran à l'autre et d'une visite à l'autre.
 *
 * `localStorage` peut lever — navigation privée, quota, réglages qui bloquent le stockage de
 * site. Un backoffice qui refuse de s'afficher parce qu'il n'a pas pu relire une préférence
 * d'affichage serait absurde : chaque accès est donc gardé, et l'échec se traduit par le
 * défaut, jamais par une page blanche. Même prudence que `tokenStore` du socle partagé.
 */
const COLLAPSED_KEY = 'lehub.admin.sidebarCollapsed'

export function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, String(collapsed))
  } catch {
    // Une préférence d'affichage perdue est sans conséquence ; une exception ici ne l'est pas.
  }
}
