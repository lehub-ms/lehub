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
/** Les référentiels qui portent la préférence ci-dessous. Une chaîne libre s'y perdrait. */
export type ReferenceScope = 'communities' | 'technologies'

/**
 * Le groupe des entrées archivées d'un référentiel, déplié ou replié d'une visite à l'autre.
 *
 * Une clé par référentiel plutôt qu'un objet JSON : rien à analyser, rien à corrompre à moitié,
 * et le défaut tombe tout seul du bon côté — clé absente, stockage refusé, valeur douteuse, tout
 * ce qui n'est pas exactement « true » se lit comme replié. C'est ce que demande le dernier edge
 * case de #173, et le `read` gardé ci-dessus le donne sans rien ajouter.
 */
export function readArchivedExpanded(scope: ReferenceScope): boolean {
  return read(ARCHIVED_PREFIX + scope) === 'true'
}

export function writeArchivedExpanded(scope: ReferenceScope, expanded: boolean): void {
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
