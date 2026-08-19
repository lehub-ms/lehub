/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the Function App, e.g. http://localhost:7071. */
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
