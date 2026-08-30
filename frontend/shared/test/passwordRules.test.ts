import { describe, expect, it } from 'vitest'
import { PASSWORD_MIN_LENGTH, PASSWORD_RULES, passwordScore } from '../src/lib/passwordRules'

describe('les règles de mot de passe', () => {
  it('annonce le plancher documenté par le tenant, pas celui de la maquette', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8)
    expect(PASSWORD_RULES.find((rule) => rule.id === 'length')?.test('a'.repeat(8))).toBe(true)
    expect(PASSWORD_RULES.find((rule) => rule.id === 'length')?.test('a'.repeat(7))).toBe(false)
  })

  it('exige les deux casses, et accepte un chiffre ou un caractère spécial', () => {
    const casing = PASSWORD_RULES.find((rule) => rule.id === 'case')
    expect(casing?.test('minuscules')).toBe(false)
    expect(casing?.test('MAJUSCULES')).toBe(false)
    expect(casing?.test('LesDeux')).toBe(true)

    const symbol = PASSWORD_RULES.find((rule) => rule.id === 'symbol')
    expect(symbol?.test('lettres')).toBe(false)
    expect(symbol?.test('lettres1')).toBe(true)
    expect(symbol?.test('lettres!')).toBe(true)
  })
})

describe('la jauge', () => {
  it('reste à zéro sur un champ vide, même si aucune règle ne le sanctionne', () => {
    expect(passwordScore('')).toBe(0)
  })

  it('compte une barre par règle satisfaite', () => {
    expect(passwordScore('abcdefgh')).toBe(1)
    expect(passwordScore('Abcdefgh')).toBe(2)
    expect(passwordScore('Abcdefg1')).toBe(3)
  })

  it('accorde une quatrième barre à une longueur confortable', () => {
    expect(passwordScore('Abcdefg1')).toBe(3)
    expect(passwordScore('Abcdefg1234567')).toBe(4)
  })
})
