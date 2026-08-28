/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the Function App, e.g. http://localhost:7071. */
  readonly VITE_API_BASE_URL: string
  /** Origin of the backoffice, e.g. https://admin.lehub.ms — offered to authorised accounts. */
  readonly VITE_ADMIN_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
