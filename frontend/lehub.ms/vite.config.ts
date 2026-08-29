// From 'vitest/config' rather than 'vite' so the `test` block below is typed.
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// No `server.proxy` on purpose. Two Static Web Apps share a single Function App,
// which Azure only allows to be linked to one of them, so both front-ends call the
// API cross-origin in every environment. Proxying /api in development would hide
// exactly the CORS path production depends on.
export default defineConfig(({ mode }) => {
  // The dev server's port and host come from .env.local, which scripts/dev-up.sh and
  // scripts/dev-start.sh render from this workspace's slot, so two worktrees can serve side
  // by side. loadEnv rather than process.env: Vite has not read the file yet when this
  // config is evaluated. The fallbacks are what slot 0 gets, and what any build without a
  // .env.local — every CI build — uses.
  const env = loadEnv(mode, import.meta.dirname)

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
        // Le socle d'authentification, partagé avec l'autre SPA. Pas un paquet npm :
        // il n'y a pas de package.json racine, et ces sources sont compilées par le
        // build de chaque application, qui résout react & co depuis son propre
        // node_modules. Voir frontend/shared/README.md.
        '@shared': path.resolve(import.meta.dirname, '../shared/src'),
      },
      // Les sources de ../shared sont hors de la racine de ce projet et n'ont pas de
      // node_modules à elles : sans ceci, le bundler cherche `react` à côté d'elles et ne
      // trouve rien. `dedupe` résout ces spécificateurs depuis la racine du projet, ce qui
      // est aussi la garantie qu'il n'existe qu'un seul React dans le bundle.
      dedupe: ['react', 'react-dom', 'clsx', 'tailwind-merge', 'lucide-react'],
    },
    server: {
      port: Number(env.VITE_DEV_PORT) || 5173,
      host: env.VITE_DEV_HOST || 'localhost',
      // Fail rather than silently move to another port: the API's CORS allow-list and
      // the Entra redirect URIs both name this exact origin.
      strictPort: true,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      // Polyfills the jsdom gaps the shell needs: matchMedia and scrollTo.
      setupFiles: ['./test/setup.ts'],
    },
  }
})
