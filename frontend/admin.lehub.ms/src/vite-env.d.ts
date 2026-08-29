/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the Function App, e.g. http://localhost:7071. */
  readonly VITE_API_BASE_URL: string
  /** Origin of the public site, e.g. https://lehub.ms — where an account is created. */
  readonly VITE_PUBLIC_SITE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
