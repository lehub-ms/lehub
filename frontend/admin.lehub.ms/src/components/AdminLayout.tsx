import type { ReactNode } from 'react'
import { Outlet, ScrollRestoration } from 'react-router'
import { Wordmark } from './Wordmark'

/**
 * Le cadre des écrans habilités.
 *
 * Délibérément minimal : la Feature #138 le remplace par la coquille du backoffice — barre
 * latérale, sélecteur de communauté, compte connecté. Ce qui est ici est ce que la story #111
 * exige et rien de plus, pour ne pas préempter des décisions qui appartiennent à une autre
 * Feature.
 */
export function AdminLayout(): ReactNode {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-slate-900/10 bg-white px-6 py-4">
        <Wordmark className="text-xl" />
      </header>

      <main id="contenu" className="flex-1 px-6 py-12">
        <Outlet />
      </main>

      {/* Aucun script en ligne en mode bibliothèque, donc `script-src 'self'` reste tenable. */}
      <ScrollRestoration />
    </div>
  )
}
