/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Server-injected pairing sentinels (set by webServer.ts when mobileAccess is
// enabled and the request presents no valid token). Undefined in Electron and
// in desktop web sessions.
interface Window {
  __WEB_PAIRING_REQUIRED__?: boolean
  __WEB_PAIRING_HOST__?: string
  __WEB_PAIRING_PORT__?: number
}
