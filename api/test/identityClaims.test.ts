import { describe, expect, it } from 'vitest'
import { ENTRA_PLACEHOLDER, NAME_MAX_LENGTH, resolveName, usableClaim } from '../src/lib/identityClaims'

describe('usableClaim', () => {
  it("traite le littéral qu'Entra pose par défaut comme une absence de valeur", () => {
    expect(usableClaim(ENTRA_PLACEHOLDER)).toBeNull()
    expect(usableClaim(null)).toBeNull()
  })

  it('laisse passer une valeur réelle, y compris celles qui y ressemblent', () => {
    for (const value of ['Ada', 'Unknown', 'unknown ', 'inconnu']) {
      expect(usableClaim(value), value).toBe(value)
    }
  })
})

describe('resolveName', () => {
  it('prend le claim quand il existe, et rien ne le supplante', () => {
    expect(resolveName('Ada', 'Charles')).toBe('Ada')
    expect(resolveName('Ada', undefined)).toBe('Ada')
    // Le sens de cette priorité est toute la règle : le tenant fait foi, le formulaire est
    // un dépannage pour l'instant où il n'a pas encore rattrapé.
    expect(resolveName('Ada', '')).toBe('Ada')
  })

  it("retombe sur la valeur soumise quand le claim manque, et alors seulement", () => {
    expect(resolveName(null, 'Charles')).toBe('Charles')
    expect(resolveName(null, '  Charles  ')).toBe('Charles')
    expect(resolveName(ENTRA_PLACEHOLDER, 'Charles')).toBe('Charles')
  })

  it("n'invente rien quand ni le claim ni la soumission ne portent de valeur", () => {
    for (const submitted of [undefined, null, '', '   ', 42, {}, ['Ada'], 'x'.repeat(NAME_MAX_LENGTH + 1)]) {
      expect(resolveName(null, submitted), JSON.stringify(submitted)).toBeNull()
    }
  })

  it("accepte une valeur soumise à la limite exacte de la colonne", () => {
    const limit = 'x'.repeat(NAME_MAX_LENGTH)
    expect(resolveName(null, limit)).toBe(limit)
  })
})
