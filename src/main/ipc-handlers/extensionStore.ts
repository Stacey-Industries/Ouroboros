/**
 * ipc-handlers/extensionStore.ts - IPC handlers for the VSX Extension Store.
 *
 * Fetches from the Open VSX Registry (https://open-vsx.org/api),
 * downloads VSIX packages, extracts them, and manages installed extensions
 * via the electron-store config.
 */

import { IpcMainInvokeEvent, ipcMain, BrowserWindow } from 'electron'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import AdmZip from 'adm-zip'
import { store } from '../config'
import { loadExtensionThemes, type OuroborosTheme } from '../contributions/themeLoader'

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow
type IpcHandler = Parameters<typeof ipcMain.handle>[1]
type HandlerSuccess<T extends object = Record<string, never>> = { success: true } & T
type HandlerFailure = { success: false; error: string }

// ─── Internal types (mirroring renderer type defs for main-process use) ──

interface VsxExtensionSummary {
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

interface VsxExtensionDetail extends VsxExtensionSummary {
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

interface InstalledVsxExtension {
  id: string
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

interface VsxSearchApiResponse {
  totalSize: number
  offset: number
  extensions: Array<{
    namespace: string
    name: string
    displayName?: string
    description?: string
    version: string
    downloadCount?: number
    rating?: number | null
    averageRating?: number | null
    timestamp?: string
    [key: string]: unknown
  }>
}

interface VsxDetailApiResponse {
  namespace: string
  name: string
  displayName?: string
  description?: string
  version: string
  downloadCount?: number
  rating?: number | null
  averageRating?: number | null
  timestamp?: string
  categories?: string[]
  tags?: string[]
  repository?: string
  homepage?: string
  bugs?: string
  icon?: string
  readme?: string
  allVersions?: Record<string, string>
  files?: Record<string, string>
  [key: string]: unknown
}

interface PackageJsonContributes {
  themes?: Array<{ label?: string; uiTheme?: string; path?: string }>
  grammars?: Array<{ language?: string; scopeName?: string; path?: string }>
  snippets?: Array<{ language?: string; path?: string }>
  languages?: Array<{ id?: string; extensions?: string[]; configuration?: string }>
}

interface ExtensionPackageJson {
  displayName?: string
  description?: string
  version?: string
  contributes?: PackageJsonContributes
  [key: string]: unknown
}

// ─── Constants ────────────────────────────────────────────────────────

const OPENVSX_BASE = 'https://open-vsx.org/api'
const EXTENSIONS_DIR = path.join(os.homedir(), '.ouroboros', 'vsx-extensions')

// ─── Utility helpers ──────────────────────────────────────────────────

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function runHandler<T extends object>(action: () => Promise<T>): Promise<HandlerSuccess<T> | HandlerFailure> {
  try {
    return { success: true, ...(await action()) }
  } catch (error) {
    return { success: false, error: getErrorMessage(error) }
  }
}

function registerHandler(channels: string[], channel: string, handler: IpcHandler): void {
  ipcMain.handle(channel, handler)
  channels.push(channel)
}

function broadcastToWindows(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(channel, data))
}

function getInstalledList(): InstalledVsxExtension[] {
  return store.get('installedVsxExtensions' as never, [] as never) as InstalledVsxExtension[]
}

function setInstalledList(list: InstalledVsxExtension[]): void {
  store.set('installedVsxExtensions' as never, list as never)
}

function getDisabledList(): string[] {
  return store.get('disabledVsxExtensions' as never, [] as never) as string[]
}

function setDisabledList(list: string[]): void {
  store.set('disabledVsxExtensions' as never, list as never)
}

// ─── API response normalizers ─────────────────────────────────────────

function extractNamespace(ns: unknown): string {
  if (typeof ns === 'string') return ns
  if (ns && typeof ns === 'object' && 'name' in ns) return String((ns as { name: unknown }).name)
  return ''
}

function toSummary(raw: VsxSearchApiResponse['extensions'][number]): VsxExtensionSummary {
  return {
    namespace: extractNamespace(raw.namespace),
    name: raw.name,
    displayName: raw.displayName ?? raw.name,
    description: raw.description ?? '',
    version: raw.version,
    downloads: raw.downloadCount ?? 0,
    rating: raw.rating ?? null,
    averageRating: raw.averageRating ?? null,
    timestamp: raw.timestamp ?? '',
  }
}

function toDetail(raw: VsxDetailApiResponse): VsxExtensionDetail {
  return {
    namespace: extractNamespace(raw.namespace),
    name: raw.name,
    displayName: raw.displayName ?? raw.name,
    description: raw.description ?? '',
    version: raw.version,
    downloads: raw.downloadCount ?? 0,
    rating: raw.rating ?? null,
    averageRating: raw.averageRating ?? null,
    timestamp: raw.timestamp ?? '',
    categories: raw.categories ?? [],
    tags: raw.tags ?? [],
    repository: raw.repository,
    homepage: raw.homepage,
    bugs: raw.bugs,
    icon: raw.icon,
    readme: raw.readme,
    allVersions: raw.allVersions ?? {},
    files: raw.files ?? {},
  }
}

// ─── Handler implementations ──────────────────────────────────────────

async function searchExtensions(
  query: string,
  offset: number,
): Promise<{ extensions: VsxExtensionSummary[]; totalSize: number; offset: number }> {
  const params = new URLSearchParams({
    query,
    size: '20',
    offset: String(offset),
    sortBy: 'downloadCount',
  })

  const url = `${OPENVSX_BASE}/-/search?${params.toString()}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Open VSX search failed: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as VsxSearchApiResponse
  return {
    extensions: (data.extensions ?? []).map(toSummary),
    totalSize: data.totalSize ?? 0,
    offset: data.offset ?? 0,
  }
}

async function getExtensionDetails(
  namespace: string,
  name: string,
): Promise<{ extension: VsxExtensionDetail }> {
  const url = `${OPENVSX_BASE}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Open VSX detail fetch failed: ${response.status} ${response.statusText}`)
  }

  const raw = (await response.json()) as VsxDetailApiResponse
  return { extension: toDetail(raw) }
}

async function installExtension(
  namespace: string,
  name: string,
  version?: string,
): Promise<{ installed: InstalledVsxExtension }> {
  // 1. Fetch detail to get the download URL
  const detailUrl = version
    ? `${OPENVSX_BASE}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`
    : `${OPENVSX_BASE}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
  const detailResponse = await fetch(detailUrl)

  if (!detailResponse.ok) {
    throw new Error(`Failed to fetch extension details: ${detailResponse.status} ${detailResponse.statusText}`)
  }

  const detail = (await detailResponse.json()) as VsxDetailApiResponse
  const downloadUrl = detail.files?.['download']

  if (!downloadUrl) {
    throw new Error(`No download URL found for ${namespace}.${name}`)
  }

  // 2. Check if already installed (same version)
  const extensionId = `${namespace}.${name}`
  const existing = getInstalledList()
  const alreadyInstalled = existing.find((e) => e.id === extensionId)
  if (alreadyInstalled && alreadyInstalled.version === detail.version) {
    throw new Error(`Extension ${extensionId} v${detail.version} is already installed.`)
  }

  // 3. Download VSIX to a temp file
  const vsixResponse = await fetch(downloadUrl)
  if (!vsixResponse.ok) {
    throw new Error(`Failed to download VSIX: ${vsixResponse.status} ${vsixResponse.statusText}`)
  }

  const buffer = Buffer.from(await vsixResponse.arrayBuffer())
  const tempDir = os.tmpdir()
  const tempPath = path.join(tempDir, `${extensionId}-${Date.now()}.vsix`)

  try {
    await fs.writeFile(tempPath, buffer)

    // 4. Extract VSIX to the extensions directory
    const targetDir = path.join(EXTENSIONS_DIR, extensionId)
    await fs.mkdir(targetDir, { recursive: true })

    const zip = new AdmZip(tempPath)
    zip.extractAllTo(targetDir, true)

    // 5. Parse extension/package.json for contributes
    const pkgJsonPath = path.join(targetDir, 'extension', 'package.json')
    let pkgJson: ExtensionPackageJson
    try {
      const pkgRaw = await fs.readFile(pkgJsonPath, 'utf-8')
      pkgJson = JSON.parse(pkgRaw) as ExtensionPackageJson
    } catch (error) {
      // If package.json is missing or corrupt, abort — the extension would be non-functional
      console.error(`[extensionStore] Failed to parse package.json for ${extensionId}:`, error)
      // Clean up the extracted directory since the install is invalid
      await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {})
      throw new Error(`Extension ${extensionId} has an invalid or missing package.json and cannot be installed.`)
    }

    const extensionRoot = path.join(targetDir, 'extension')
    const rawContributes = pkgJson.contributes ?? {}

    // 6. Build contributes metadata with resolved absolute paths
    const contributes: InstalledVsxExtension['contributes'] = {}

    if (rawContributes.themes && rawContributes.themes.length > 0) {
      contributes.themes = rawContributes.themes
        .filter((t) => t.label && t.path)
        .map((t) => ({
          label: t.label!,
          uiTheme: t.uiTheme ?? 'vs-dark',
          path: path.join(extensionRoot, t.path!),
        }))
    }

    if (rawContributes.grammars && rawContributes.grammars.length > 0) {
      contributes.grammars = rawContributes.grammars
        .filter((g) => g.language && g.scopeName && g.path)
        .map((g) => ({
          language: g.language!,
          scopeName: g.scopeName!,
          path: path.join(extensionRoot, g.path!),
        }))
    }

    if (rawContributes.snippets && rawContributes.snippets.length > 0) {
      contributes.snippets = rawContributes.snippets
        .filter((s) => s.language && s.path)
        .map((s) => ({
          language: s.language!,
          path: path.join(extensionRoot, s.path!),
        }))
    }

    if (rawContributes.languages && rawContributes.languages.length > 0) {
      contributes.languages = rawContributes.languages
        .filter((l) => l.id)
        .map((l) => ({
          id: l.id!,
          ...(l.extensions ? { extensions: l.extensions } : {}),
          ...(l.configuration ? { configuration: path.join(extensionRoot, l.configuration) } : {}),
        }))
    }

    // 7. Build the installed extension record
    const installed: InstalledVsxExtension = {
      id: extensionId,
      namespace,
      name,
      displayName: pkgJson.displayName ?? detail.displayName ?? name,
      version: detail.version,
      description: pkgJson.description ?? detail.description ?? '',
      installPath: targetDir,
      installedAt: new Date().toISOString(),
      contributes,
    }

    // 8. Update config: replace existing entry or add new one
    const updatedList = existing.filter((e) => e.id !== extensionId)
    updatedList.push(installed)
    setInstalledList(updatedList)

    // 9. Also remove from disabled list if it was disabled
    const disabled = getDisabledList()
    if (disabled.includes(extensionId)) {
      setDisabledList(disabled.filter((id) => id !== extensionId))
    }

    // 10. Notify renderer
    broadcastToWindows('extensionStore:installed', installed)

    return { installed }
  } finally {
    // Clean up temp VSIX file
    try {
      await fs.unlink(tempPath)
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function uninstallExtension(id: string): Promise<Record<string, never>> {
  const existing = getInstalledList()
  const entry = existing.find((e) => e.id === id)

  if (!entry) {
    throw new Error(`Extension "${id}" is not installed.`)
  }

  // Remove the extension directory
  try {
    await fs.rm(entry.installPath, { recursive: true, force: true })
  } catch {
    // Directory may already be gone — continue with config cleanup
  }

  // Remove from installed list
  setInstalledList(existing.filter((e) => e.id !== id))

  // Remove from disabled list if present
  const disabled = getDisabledList()
  if (disabled.includes(id)) {
    setDisabledList(disabled.filter((d) => d !== id))
  }

  // Notify renderer
  broadcastToWindows('extensionStore:uninstalled', { id })

  return {}
}

async function getInstalledExtensions(): Promise<{ extensions: InstalledVsxExtension[] }> {
  return { extensions: getInstalledList() }
}

async function enableContributions(id: string): Promise<Record<string, never>> {
  const installed = getInstalledList()
  if (!installed.some((e) => e.id === id)) {
    throw new Error(`Extension "${id}" is not installed.`)
  }

  const disabled = getDisabledList()
  if (!disabled.includes(id)) {
    return {} // Already enabled
  }

  setDisabledList(disabled.filter((d) => d !== id))
  broadcastToWindows('extensionStore:contributionsChanged', { id, enabled: true })

  return {}
}

async function disableContributions(id: string): Promise<Record<string, never>> {
  const installed = getInstalledList()
  if (!installed.some((e) => e.id === id)) {
    throw new Error(`Extension "${id}" is not installed.`)
  }

  const disabled = getDisabledList()
  if (disabled.includes(id)) {
    return {} // Already disabled
  }

  setDisabledList([...disabled, id])
  broadcastToWindows('extensionStore:contributionsChanged', { id, enabled: false })

  return {}
}

// ─── Theme contribution loading ──────────────────────────────────────

async function getThemeContributions(): Promise<{ themes: OuroborosTheme[] }> {
  const installed = getInstalledList()
  const disabled = new Set(getDisabledList())
  const allThemes: OuroborosTheme[] = []

  for (const ext of installed) {
    if (disabled.has(ext.id)) continue
    if (!ext.contributes.themes || ext.contributes.themes.length === 0) continue

    const themes = await loadExtensionThemes(ext.id, ext.contributes.themes)
    allThemes.push(...themes)
  }

  return { themes: allThemes }
}

// ─── Registration ─────────────────────────────────────────────────────

export function registerExtensionStoreHandlers(_senderWindow: SenderWindow): string[] {
  const channels: string[] = []
  void _senderWindow

  registerHandler(channels, 'extensionStore:search', async (_event, query: string, offset?: number) =>
    runHandler(() => searchExtensions(query, offset ?? 0)),
  )

  registerHandler(channels, 'extensionStore:getDetails', async (_event, namespace: string, name: string) =>
    runHandler(() => getExtensionDetails(namespace, name)),
  )

  registerHandler(channels, 'extensionStore:install', async (_event, namespace: string, name: string, version?: string) =>
    runHandler(() => installExtension(namespace, name, version)),
  )

  registerHandler(channels, 'extensionStore:uninstall', async (_event, id: string) =>
    runHandler(() => uninstallExtension(id)),
  )

  registerHandler(channels, 'extensionStore:getInstalled', async () =>
    runHandler(() => getInstalledExtensions()),
  )

  registerHandler(channels, 'extensionStore:enableContributions', async (_event, id: string) =>
    runHandler(() => enableContributions(id)),
  )

  registerHandler(channels, 'extensionStore:disableContributions', async (_event, id: string) =>
    runHandler(() => disableContributions(id)),
  )

  registerHandler(channels, 'extensionStore:getThemeContributions', async () =>
    runHandler(() => getThemeContributions()),
  )

  return channels
}
