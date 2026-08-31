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
      },
      // @lehub/shared est lié par `file:`, donc résolu à son chemin réel : ses propres
      // imports partent de frontend/shared/node_modules, où ses dépendances de test
      // installent un second React. `dedupe` force ces spécificateurs à se résoudre depuis
      // la racine de ce projet — c'est la garantie d'un seul React dans le bundle, et elle
      // survient maintenant que le socle est un paquet, pas malgré.
      dedupe: ['react', 'react-dom', 'clsx', 'tailwind-merge', 'lucide-react', 'react-router'],
    },
    server: {
      port: Number(env.VITE_DEV_PORT) || 5174,
      host: env.VITE_DEV_HOST || 'localhost',
      // Fail rather than silently move to another port: the API's CORS allow-list and
      // the Entra redirect URIs both name this exact origin.
      strictPort: true,
    },
    test: {
      setupFiles: ['./test/setup.ts'],
      environment: 'jsdom',
      globals: true,
    },
  }
})
