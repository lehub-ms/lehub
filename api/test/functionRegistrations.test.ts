import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const FUNCTIONS_DIR = join(import.meta.dirname, '..', 'src', 'functions')

interface Registration {
  file: string
  name: string
  route: string
  methods: string[]
}

/**
 * Lit les enregistrements dans la source plutôt que d'importer les modules : `app.http` est
 * neutralisé en mode test par `@azure/functions`, donc rien ne serait observable autrement.
 * Même technique que `seedMedia.test.ts`, qui analyse le seed sans base.
 */
function registrations(): Registration[] {
  return readdirSync(FUNCTIONS_DIR)
    .filter((file) => file.endsWith('.ts'))
    .flatMap((file) => {
      const source = readFileSync(join(FUNCTIONS_DIR, file), 'utf8')
      const name = /app\.http\('([^']+)'/.exec(source)?.[1]
      const route = /route:\s*'([^']+)'/.exec(source)?.[1]
      const methods = /methods:\s*\[([^\]]*)\]/.exec(source)?.[1]
      if (!name || !route) return []
      return [
        {
          file,
          name,
          route,
          methods: [...(methods ?? '').matchAll(/'([A-Z]+)'/g)].map((match) => match[1] ?? ''),
        },
      ]
    })
}

describe('enregistrement des fonctions', () => {
  it('donne un nom distinct à chaque fonction', () => {
    // Deux `app.http` de même nom, c'est un conflit d'enregistrement dans l'hôte — et il ne se
    // voit ni à la compilation ni dans les tests unitaires de chaque handler. Cette assertion
    // existe parce qu'un copier-coller de route en a bel et bien produit un.
    const names = registrations().map((registration) => registration.name)

    expect(new Set(names).size).toBe(names.length)
  })

  it('donne un couple route + méthode distinct à chaque fonction', () => {
    const pairs = registrations().flatMap((registration) =>
      registration.methods.map((method) => `${method} ${registration.route}`),
    )

    expect(new Set(pairs).size).toBe(pairs.length)
  })

  it('garde des chemins littéraux en minuscules, sans barre oblique initiale', () => {
    // Le préfixe /api est celui de l'hôte : une route qui commencerait par une barre oblique se
    // publierait à un chemin double. Les segments de paramètre restent en casse mixte
    // (`{communityId}`), qui est la convention Functions — seuls les segments littéraux sont
    // contraints.
    for (const { route } of registrations()) {
      expect(route.startsWith('/')).toBe(false)

      const literals = route.split('/').filter((segment) => !segment.startsWith('{'))
      expect(literals).toEqual(literals.map((segment) => segment.toLowerCase()))
    }
  })
})
