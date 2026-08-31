import { describe, expect, it } from 'vitest'
import { fallbackSlug, isValidSlug, slugFor, slugify } from '../src/lib/slug'

describe('slugify', () => {
  it('rabat les accents plutôt que de les refuser', () => {
    expect(slugify('Communauté Azuré')).toBe('communaute-azure')
    expect(slugify('Élan Numérique')).toBe('elan-numerique')
    expect(slugify('Forêt & Café')).toBe('foret-cafe')
  })

  it('effondre la ponctuation et les espaces en un seul tiret', () => {
    expect(slugify('Tech & Wine   Marseille')).toBe('tech-wine-marseille')
    expect(slugify('  --Azure--  ')).toBe('azure')
  })

  it('rend la chaîne vide pour un nom sans caractère transposable', () => {
    // Le repli est décidé par l'appelant, pas ici : l'API en dérive un depuis l'identifiant, le
    // formulaire ne propose rien et le demande.
    expect(slugify('日本語')).toBe('')
    expect(slugify('★★★')).toBe('')
    expect(slugify('   ')).toBe('')
  })

  it('tronque à 60 caractères sur une frontière de mot', () => {
    const long = 'Communauté Généraliste du Numérique Responsable en Nouvelle Aquitaine'
    const slug = slugify(long)

    expect(slug.length).toBeLessThanOrEqual(60)
    // Jamais coupé au milieu d'un mot : le dernier segment est entier.
    expect(long.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')).toContain(
      slug.split('-').pop() ?? '',
    )
    expect(slug.endsWith('-')).toBe(false)
  })

  it('tronque même un mot unique plus long que la limite', () => {
    // Pas de frontière où reculer : on coupe, plutôt que de rendre une chaîne vide.
    expect(slugify('a'.repeat(80))).toBe('a'.repeat(60))
  })

  it('est idempotente', () => {
    for (const name of ['Azure User Group France', 'Communauté Azuré', 'Tech & Wine']) {
      expect(slugify(slugify(name))).toBe(slugify(name))
    }
  })
})

describe('isValidSlug', () => {
  it('accepte la forme attendue', () => {
    expect(isValidSlug('azure-user-group-france')).toBe(true)
    expect(isValidSlug('microsoft-365-community')).toBe(true)
    expect(isValidSlug('azure')).toBe(true)
  })

  it('refuse ce que la colonne ou l’index n’accepteraient pas', () => {
    expect(isValidSlug('')).toBe(false)
    expect(isValidSlug('Azure')).toBe(false)
    expect(isValidSlug('azure user group')).toBe(false)
    expect(isValidSlug('communauté')).toBe(false)
    expect(isValidSlug('-azure')).toBe(false)
    expect(isValidSlug('azure-')).toBe(false)
    expect(isValidSlug('azure--france')).toBe(false)
    expect(isValidSlug('a'.repeat(81))).toBe(false)
  })

  it('refuse un slug qui a la forme d’un identifiant', () => {
    // L'edge case de #166 : la résolution d'une adresse ne doit jamais hésiter entre les deux
    // formes, et le plus simple est qu'aucun slug ne puisse ressembler à un GUID.
    expect(isValidSlug('c1c1c1c1-0000-0000-0000-000000000001')).toBe(false)
    expect(isValidSlug('C1C1C1C1-0000-0000-0000-000000000001')).toBe(false)
  })
})

describe('slugFor', () => {
  const ID = 'C1C1C1C1-0000-0000-0000-000000000001'

  it('rend le slug du nom quand il en produit un', () => {
    expect(slugFor('Azure User Group France', ID)).toBe('azure-user-group-france')
  })

  it('ne rend jamais une chaîne vide', () => {
    expect(slugFor('日本語', ID)).toBe(fallbackSlug(ID))
    expect(isValidSlug(slugFor('★', ID))).toBe(true)
  })
})
