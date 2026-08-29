import { describe, expect, it } from 'vitest'
import { errorId, hintId } from '../src/lib/fieldIds'

/**
 * Ces deux fonctions ne valent que par leur accord avec `Field.tsx`, qui pose les `id` que
 * les contrôles citent dans leur `aria-describedby`. Une divergence ne casse rien de visible
 * et détache silencieusement le message d'erreur de son champ pour un lecteur d'écran.
 */
describe('les identifiants dérivés d’un champ', () => {
  it('dérive un identifiant distinct pour l’aide et pour l’erreur', () => {
    expect(hintId('email')).toBe('email-hint')
    expect(errorId('email')).toBe('email-error')
    expect(hintId('email')).not.toBe(errorId('email'))
  })
})
