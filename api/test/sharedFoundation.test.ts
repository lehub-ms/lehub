import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Comme api/test/seedMedia.test.ts, cette suite lit hors de api/ à dessein — et pour une
 * raison du même ordre : ce qu'elle vérifie n'est couvert par aucune autre étape de la chaîne.
 *
 * `frontend/shared` n'a ni package.json, ni node_modules, ni configuration ESLint : ses
 * sources sont compilées par le build de chaque application, qui leur résout `react` depuis
 * le sien. Le revers est qu'ESLint ne les atteint pas — il refuse un chemin hors du
 * répertoire de sa configuration, et lui en donner une supposerait de rendre au socle tout ce
 * qu'on vient de lui retirer.
 *
 * Les deux `tsc -b` le typent, `strict` compris. Les deux règles ci-dessous sont propres à
 * ESLint, et CLAUDE.md en fait des non-négociables : elles se vérifient donc sur le texte,
 * comme le dépôt le fait déjà ailleurs.
 */
const SHARED = resolve(import.meta.dirname, '..', '..', 'frontend', 'shared', 'src')

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return ['.ts', '.tsx'].includes(extname(entry.name)) ? [path] : []
  })
}

const FILES = sources(SHARED)

describe('socle partagé', () => {
  it('contient bien les sources attendues', () => {
    // Sans ce garde-fou, un chemin devenu faux ferait passer les deux règles sur zéro fichier.
    expect(FILES.length).toBeGreaterThan(10)
  })

  it("n'utilise nulle part le type any", () => {
    for (const file of FILES) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/(?::\s*any\b|\bas\s+any\b|<any[,>])/)
    }
  })

  it('déclare ses sources à Tailwind', () => {
    // Le piège le plus coûteux de ce répertoire, et le plus silencieux : Tailwind v4 ne scanne
    // que la racine du projet qui compile, et celui-ci est en dehors. Sans `@source`, toute
    // classe utilisée par un composant du socle et par lui seul disparaît de la feuille des
    // deux applications — sans erreur, sans avertissement, sans build cassé. C'est ce qui a
    // vidé les deux écrans d'authentification de leurs styles de champ.
    const theme = readFileSync(join(SHARED, 'theme.css'), 'utf8')
    expect(theme).toMatch(/^@source\s/m)
  })

  it('ne supprime aucune erreur du compilateur', () => {
    for (const file of FILES) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/@ts-(ignore|expect-error|nocheck)/)
    }
  })
})
