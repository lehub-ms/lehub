// From 'vitest/config' rather than 'vite' so the `test` block below is typed.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// No `server.proxy` on purpose. Two Static Web Apps share a single Function App,
// which Azure only allows to be linked to one of them, so both front-ends call the
// API cross-origin in every environment. Proxying /api in development would hide
// exactly the CORS path production depends on.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    port: 5173,
    // Fail rather than silently move to another port: the API's CORS allow-list and
    // the Entra redirect URIs both name this exact origin.
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
