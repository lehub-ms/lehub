/// <reference types="vite/client" />

/**
 * `vite/client` types `import.meta.env` with an `any` index signature, so every read from it
 * is an unsafe assignment as far as the type-checked lint rules are concerned. Each front-end
 * already narrows it to the variables it actually reads; this package does the same for the
 * single one its transport layer needs, rather than suppressing the rule at the two call
 * sites.
 */
interface ImportMetaEnv {
  /** Origin of the Function App, e.g. http://localhost:7071. */
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
