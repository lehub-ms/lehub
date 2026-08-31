import { describe, expect, it } from 'vitest'
import { initials } from '../src/lib/initials'

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    // Le cas qui a motivé le passage à deux lettres : ces trois-là ne se distinguaient pas.
    expect(initials('Azure User Group France')).toBe('AU')
    expect(initials('Azure User Group Bordeaux')).toBe('AU')
    expect(initials('Cloud Native Nantes')).toBe('CN')
  })

  it('rend une seule lettre pour un nom d’un seul mot', () => {
    expect(initials('Azure')).toBe('A')
    expect(initials('.NET')).toBe('N')
  })

  it('ignore la ponctuation plutôt que de la prendre pour une initiale', () => {
    expect(initials('Tech & Wine Marseille')).toBe('TW')
    expect(initials('Microsoft 365 Community')).toBe('M3')
  })

  it('met en majuscule, y compris une lettre accentuée', () => {
    expect(initials('élan numérique')).toBe('ÉN')
  })

  it('ne rend jamais une pastille vide', () => {
    // Un nom fait de symboles seuls, ou vide : le repli vaut mieux qu'un disque muet.
    expect(initials('###')).toBe('?')
    expect(initials('   ')).toBe('?')
    expect(initials('')).toBe('?')
  })
})
