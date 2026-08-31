/**
 * Les préférences d'affichage du backoffice : l'état réduit de la barre latérale, et la
 * dernière communauté sur laquelle on a travaillé.
 *
 * `localStorage` peut lever — navigation privée, quota, réglages qui bloquent le stockage de
 * site. Un backoffice qui refuse de s'afficher parce qu'il n'a pas pu relire une préférence
 * serait absurde : chaque accès est donc gardé, et l'échec se traduit par le défaut, jamais
 * par une page blanche. Même prudence que `tokenStore` du socle partagé.
 */
const COLLAPSED_KEY = 'lehub.admin.sidebarCollapsed'
const COMMUNITY_KEY = 'lehub.admin.communityId'
const ARCHIVED_PREFIX = 'lehub.admin.archivedExpanded.'

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Une préférence perdue est sans conséquence ; une exception ici ne l'est pas.
  }
}

export function readSidebarCollapsed(): boolean {
  return read(COLLAPSED_KEY) === 'true'
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  write(COLLAPSED_KEY, String(collapsed))
}

/**
 * Les écrans qui portent la préférence ci-dessous. Une chaîne libre s'y perdrait.
 *
 * `events` a rejoint les deux référentiels avec #174 : le groupe replié n'y contient pas des
 * entrées archivées mais des évènements passés. C'est le même geste, la même préférence, et donc
 * le même mécanisme — d'où le renommage depuis `ReferenceScope`.
 */
export type GroupScope = 'communities' | 'technologies' | 'events'

/**
 * Le groupe replié d'un écran — entrées archivées (#173), évènements passés (#174) — déplié ou
 * replié d'une visite à l'autre.
 *
 * Une clé par écran plutôt qu'un objet JSON : rien à analyser, rien à corrompre à moitié, et le
 * défaut tombe tout seul du bon côté — clé absente, stockage refusé, valeur douteuse, tout ce qui
 * n'est pas exactement « true » se lit comme replié. C'est ce que demandent le dernier edge case
 * de #173 et le critère « son absence n'empêche pas l'écran de s'afficher replié » de #174, et le
 * `read` gardé ci-dessus le donne sans rien ajouter.
 *
 * **Le préfixe de clé ne change pas** malgré le renommage : une préférence déjà posée dans un
 * navigateur y survit, et rien ne justifie de la perdre pour un nom de fonction.
 */
export function readGroupExpanded(scope: GroupScope): boolean {
  return read(ARCHIVED_PREFIX + scope) === 'true'
}

export function writeGroupExpanded(scope: GroupScope, expanded: boolean): void {
  write(ARCHIVED_PREFIX + scope, String(expanded))
}

/**
 * La dernière communauté choisie, pour que l'entrée du backoffice y ramène.
 *
 * L'URL porte la communauté sur les écrans de la section ; cette préférence ne sert qu'à
 * répondre à la question que l'URL ne pose pas : « où atterrit-on en arrivant sur `/` ? ».
 * Sa valeur n'est jamais crue sur parole — elle est confrontée aux communautés que la session
 * autorise, et une désignation retirée depuis la dernière visite retombe sur la première.
 */
export function readLastCommunityId(): string | null {
  return read(COMMUNITY_KEY)
}

export function writeLastCommunityId(communityId: string): void {
  write(COMMUNITY_KEY, communityId)
}
