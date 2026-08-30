// From 'vitest/config' rather than 'vite' so the `test` block below is typed. This package
// ships no application, so it has no vite.config.ts to host the suite the way both
// front-ends do — the test configuration stands on its own here.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
