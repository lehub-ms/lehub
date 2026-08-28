import { describe, expect, it } from 'vitest'
import swaConfig from '../public/staticwebapp.config.json'
import type { RouteObject } from 'react-router'
import { RequireSession } from '@/components/RequireSession'
import { PATHS } from '@/lib/navigation'
import { routes } from '@/routes'

/**
 * « Une route non protégée est impossible par construction, pas par vigilance » (#111).
 *
 * Le test ci-dessous est la construction en question : il énumère les chemins que la table
 * expose hors de `RequireSession` et exige qu'ils soient exactement les deux prévus. Ajouter
 * un écran hors de la garde le fait échouer, ce qu'aucune relecture ne garantit.
 */
function pathsOutside(nodes: readonly RouteObject[], guarded: boolean): string[] {
  return nodes.flatMap((node) => {
    const inside = guarded || node.Component === RequireSession
    const here = !inside && typeof node.path === 'string' ? [node.path] : []
    return [...here, ...pathsOutside(node.children ?? [], inside)]
  })
}

describe('table de routes', () => {
  it("n'expose que la connexion et la réinitialisation hors de la garde", () => {
    expect(pathsOutside(routes, false).sort()).toEqual([PATHS.resetPassword, PATHS.signIn].sort())
  })

  it('impose une casse stricte sur chaque chemin nommé', () => {
    // React Router compile chaque motif avec l'option `i` par défaut : sans ceci,
    // « /CONNEXION » résoudrait vers la page de connexion.
    const named = (nodes: readonly RouteObject[]): RouteObject[] =>
      nodes.flatMap((node) => [
        ...(typeof node.path === 'string' && node.path !== '*' && node.path !== PATHS.home ? [node] : []),
        ...named(node.children ?? []),
      ])
    for (const route of named(routes)) {
      expect(route.caseSensitive, route.path).toBe(true)
    }
  })
})

describe('en-têtes servis par la Static Web App', () => {
  // Le backoffice ne doit pas être indexable. L'en-tête est en place depuis #78 ; ce test
  // existe pour qu'il ne disparaisse pas en silence, la configuration n'étant appliquée que
  // par Azure et donc invisible en local comme en CI.
  const headers: Record<string, string> = swaConfig.globalHeaders

  it("interdit l'indexation", () => {
    expect(headers['X-Robots-Tag']).toBe('noindex, nofollow')
  })

  it('conserve les en-têtes de sécurité des deux applications', () => {
    for (const header of ['Content-Security-Policy', 'X-Frame-Options', 'X-Content-Type-Options']) {
      expect(headers[header], header).toBeTruthy()
    }
  })
})
