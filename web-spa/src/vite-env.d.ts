/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Mission Control service seam. Injected at runtime; see `.env.example`. */
  readonly VITE_MC_SERVICE_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
