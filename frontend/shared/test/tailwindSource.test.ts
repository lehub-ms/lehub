import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Reprise d'`api/test/sharedFoundation.test.ts`, que ce paquet remplace.
 *
 * Trois des quatre vérifications de cette suite étaient des expressions régulières tenant
 * lieu de règles ESLint, faute d'un correcteur capable d'atteindre ce répertoire : elles sont
 * désormais `@typescript-eslint/no-explicit-any` et `ban-ts-comment`, appliquées pour de bon.
 *
 * Celle-ci reste, parce qu'aucun compilateur ni correcteur ne l'attrape. Tailwind v4 ne scanne
 * que la racine du projet qui compile, et ce paquet est en dehors — pire, il est désormais
 * atteint à travers `node_modules`, que Tailwind ignore par défaut. Sans `@source`, toute
 * classe utilisée par un composant du socle et par lui seul disparaît de la feuille des deux
 * applications : sans erreur, sans avertissement, sans build cassé. C'est ce qui a vidé les
 * deux écrans d'authentification de leurs styles de champ.
 *
 * La feuille est lue sur le disque, et non importée : un `import ... from '../src/theme.css'`
 * rend la chaîne vide sous Vitest, qui neutralise le CSS par défaut. Le test passerait alors
 * sur du vide, ce qui est exactement le défaut qu'il surveille.
 */
describe('la feuille de tokens', () => {
  it('déclare ses sources à Tailwind', () => {
    const theme = readFileSync(join(import.meta.dirname, '..', 'src', 'theme.css'), 'utf8')
    expect(theme).toMatch(/^@source\s/m)
  })
})
