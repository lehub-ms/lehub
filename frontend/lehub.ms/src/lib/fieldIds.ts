/**
 * Les identifiants dérivés d'un champ, pour que le contrôle sache à quoi se décrire.
 *
 * Dans un fichier à part parce que `Field.tsx` n'exporte que son composant : mêler des
 * fonctions à un module de composant casse le rafraîchissement à chaud de Vite.
 */
export function hintId(htmlFor: string): string {
  return `${htmlFor}-hint`
}

export function errorId(htmlFor: string): string {
  return `${htmlFor}-error`
}
