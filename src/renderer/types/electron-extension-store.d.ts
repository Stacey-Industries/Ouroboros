import type { IpcResult } from './electron-foundation'

// Open VSX search result item
export interface VsxExtensionSummary {
  namespace: string
  name: string
  displayName: string
  description: string
  version: string
  downloads: number
  rating: number | null
  averageRating: number | null
  timestamp: string
}

// Full extension detail
export interface VsxExtensionDetail extends VsxExtensionSummary {
  categories: string[]
  tags: string[]
  repository?: string
  homepage?: string
  bugs?: string
  icon?: string
  readme?: string
  allVersions: Record<string, string>
  files: Record<string, string>
}

// Search response
export interface VsxSearchResponse {
  totalSize: number
  offset: number
  extensions: VsxExtensionSummary[]
}

// Installed extension metadata (persisted in config)
export interface InstalledVsxExtension {
  id: string                  // "{namespace}.{name}"
  namespace: string
  name: string
  displayName: string
  version: string
  description: string
  installPath: string
  installedAt: string
  contributes: {
    themes?: Array<{ label: string; uiTheme: string; path: string }>
    grammars?: Array<{ language: string; scopeName: string; path: string }>
    snippets?: Array<{ language: string; path: string }>
    languages?: Array<{ id: string; extensions?: string[]; configuration?: string }>
  }
}

// Theme object returned by the contribution loader
export interface ExtensionThemeData {
  id: string
  name: string
  fontFamily: { mono: string; ui: string }
  colors: {
    bg: string; bgSecondary: string; bgTertiary: string
    border: string; borderMuted: string
    text: string; textSecondary: string; textMuted: string; textFaint: string
    accent: string; accentHover: string; accentMuted: string
    success: string; warning: string; error: string
    purple: string; purpleMuted: string
    selection: string; focusRing: string
    termBg: string; termFg: string; termCursor: string; termSelection: string
  }
}

// IPC API shape
export interface ExtensionStoreAPI {
  search: (query: string, offset?: number) => Promise<IpcResult & {
    extensions?: VsxExtensionSummary[]
    totalSize?: number
    offset?: number
  }>
  getDetails: (namespace: string, name: string) => Promise<IpcResult & {
    extension?: VsxExtensionDetail
  }>
  install: (namespace: string, name: string, version?: string) => Promise<IpcResult & {
    installed?: InstalledVsxExtension
  }>
  uninstall: (id: string) => Promise<IpcResult>
  getInstalled: () => Promise<IpcResult & {
    extensions?: InstalledVsxExtension[]
  }>
  enableContributions: (id: string) => Promise<IpcResult>
  disableContributions: (id: string) => Promise<IpcResult>
  getThemeContributions: () => Promise<IpcResult & {
    themes?: ExtensionThemeData[]
  }>
}
