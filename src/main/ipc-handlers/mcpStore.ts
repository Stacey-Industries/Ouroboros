/**
 * ipc-handlers/mcpStore.ts - IPC handlers for the MCP Server Store.
 *
 * Fetches from the Official MCP Registry (https://registry.modelcontextprotocol.io)
 * and installs servers by writing to Claude Code settings files.
 */

import { IpcMainInvokeEvent, ipcMain, BrowserWindow } from 'electron'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { store } from '../config'

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow
type SettingsRecord = Record<string, unknown>
type ServerMap = Record<string, McpServerConfig>
type IpcHandler = Parameters<typeof ipcMain.handle>[1]
type HandlerSuccess<T extends object = Record<string, never>> = { success: true } & T
type HandlerFailure = { success: false; error: string }

interface McpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

// ─── Raw API response shapes (actual registry format) ────────────────

interface RawRegistryEnvVar {
  name: string
  description?: string
  isRequired?: boolean
  format?: string
}

interface RawRegistryPackage {
  registryType: 'npm' | 'pypi' | 'docker' | 'oci' | 'mcpb'
  identifier: string
  version?: string
  transport?: { type: string }
  environmentVariables?: RawRegistryEnvVar[]
}

interface RawRegistryServerEntry {
  server: {
    name: string
    title?: string
    description?: string
    version: string
    packages?: RawRegistryPackage[]
    repository?: { url?: string; source?: string }
    remotes?: Array<{ type: string; url: string }>
    websiteUrl?: string
  }
  _meta: Record<string, {
    status: string
    publishedAt: string
    updatedAt: string
    statusChangedAt?: string
    isLatest?: boolean
  }>
}

interface RawRegistryListResponse {
  servers: RawRegistryServerEntry[]
  metadata?: { nextCursor?: string; count?: number }
}

// ─── Normalized types used by the UI ─────────────────────────────────

interface McpRegistryPackage {
  registry_type: 'npm' | 'pypi' | 'docker' | 'oci' | 'mcpb'
  name: string
  version: string
  runtime?: {
    args?: string[]
    env?: Record<string, string>
  }
  environmentVariables?: RawRegistryEnvVar[]
}

interface McpRegistryServer {
  name: string
  title: string
  description: string
  version: string
  packages: McpRegistryPackage[]
  _meta: {
    status: string
    publishedAt: string
    updatedAt: string
    isLatest?: boolean
  }
}

// ─── Normalizer: raw API → UI types ─────────────────────────────────

function normalizePackage(raw: RawRegistryPackage): McpRegistryPackage {
  return {
    registry_type: raw.registryType,
    name: raw.identifier,
    version: raw.version ?? '',
    environmentVariables: raw.environmentVariables,
  }
}

function normalizeServer(entry: RawRegistryServerEntry): McpRegistryServer {
  const s = entry.server
  // _meta uses a namespaced key; extract the first (only) value
  const metaValues = Object.values(entry._meta ?? {})
  const meta = metaValues[0] ?? { status: 'active', publishedAt: '', updatedAt: '' }

  return {
    name: s.name ?? '',
    title: s.title ?? '',
    description: s.description ?? '',
    version: s.version ?? '',
    packages: (s.packages ?? []).map(normalizePackage),
    _meta: {
      status: meta.status,
      publishedAt: meta.publishedAt,
      updatedAt: meta.updatedAt,
      isLatest: meta.isLatest,
    },
  }
}

const REGISTRY_BASE = 'https://registry.modelcontextprotocol.io/v0.1'

// ─── Settings helpers (mirrored from mcp.ts) ─────────────────────────

function getGlobalSettingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json')
}

function getProjectSettingsPath(projectRoot: string): string {
  return path.join(projectRoot, '.claude', 'settings.json')
}

async function readSettingsFile(filePath: string): Promise<SettingsRecord> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as SettingsRecord
  } catch (error: unknown) {
    // File not found is expected — return empty settings for first-time use
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'ENOENT') {
      return {}
    }
    // Other errors (parse failures, permission errors) should not silently return empty —
    // that would cause data loss when the settings are written back.
    console.error(`[mcpStore] Failed to read settings file ${filePath}:`, error)
    throw error
  }
}

async function writeSettingsFile(filePath: string, data: SettingsRecord): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function getStoredProjectRoot(): string | null {
  try {
    const roots: string[] = store.get('multiRoots', [])
    if (roots.length > 0) return roots[0]

    const defaultRoot: string = store.get('defaultProjectRoot', '')
    return defaultRoot || null
  } catch {
    return null
  }
}

function resolveProjectRoot(projectRoot?: string): string | null {
  return projectRoot ?? getStoredProjectRoot()
}

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

// ─── Registry helpers ─────────────────────────────────────────────────

function extractShortName(registryName: string): string {
  // "io.github.user/server-name" → "server-name"
  const slashIdx = registryName.lastIndexOf('/')
  if (slashIdx >= 0) return registryName.slice(slashIdx + 1)
  // Fallback: last dot-segment  "com.example.server" → "server"
  const dotIdx = registryName.lastIndexOf('.')
  if (dotIdx >= 0) return registryName.slice(dotIdx + 1)
  return registryName
}

function packageToConfig(pkg: McpRegistryPackage): McpServerConfig {
  const runtimeArgs = pkg.runtime?.args ?? []
  const env = pkg.runtime?.env

  switch (pkg.registry_type) {
    case 'npm':
      return {
        command: 'npx',
        args: ['-y', pkg.name, ...runtimeArgs],
        ...(env && Object.keys(env).length > 0 ? { env } : {}),
      }
    case 'pypi':
      return {
        command: 'uvx',
        args: [pkg.name, ...runtimeArgs],
        ...(env && Object.keys(env).length > 0 ? { env } : {}),
      }
    case 'docker':
      return {
        command: 'docker',
        args: ['run', '-i', '--rm', pkg.name, ...runtimeArgs],
        ...(env && Object.keys(env).length > 0 ? { env } : {}),
      }
    default:
      // oci, mcpb, or unknown — fall back to npm-style
      return {
        command: 'npx',
        args: ['-y', pkg.name, ...runtimeArgs],
        ...(env && Object.keys(env).length > 0 ? { env } : {}),
      }
  }
}

// ─── Handler implementations ──────────────────────────────────────────

async function searchServers(query: string, cursor?: string): Promise<{
  servers: McpRegistryServer[]
  nextCursor?: string
}> {
  const params = new URLSearchParams({ limit: '20' })
  if (query) params.set('search', query)
  if (cursor) params.set('cursor', cursor)

  const url = `${REGISTRY_BASE}/servers?${params.toString()}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Registry search failed: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as RawRegistryListResponse
  return {
    servers: (data.servers ?? []).map(normalizeServer),
    nextCursor: data.metadata?.nextCursor,
  }
}

async function getServerDetails(name: string): Promise<{ server: McpRegistryServer }> {
  const url = `${REGISTRY_BASE}/servers/${encodeURIComponent(name)}/versions/latest`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Registry fetch failed: ${response.status} ${response.statusText}`)
  }

  // Detail endpoint returns a single entry in the same wrapped format
  const raw = (await response.json()) as RawRegistryServerEntry
  return { server: normalizeServer(raw) }
}

async function installServer(
  server: McpRegistryServer,
  scope: 'global' | 'project',
): Promise<Record<string, never>> {
  if (!server.packages || server.packages.length === 0) {
    throw new Error('Server has no installable packages.')
  }

  const pkg = server.packages[0]
  const config = packageToConfig(pkg)
  const shortName = extractShortName(server.name)

  const filePath =
    scope === 'global'
      ? getGlobalSettingsPath()
      : getProjectSettingsPath(resolveProjectRoot() ?? '')

  if (scope === 'project' && !resolveProjectRoot()) {
    throw new Error('No project root available for project-scoped installation.')
  }

  const settings = await readSettingsFile(filePath)
  const mcpServers = { ...((settings.mcpServers ?? {}) as ServerMap) }

  if (mcpServers[shortName]) {
    throw new Error(`Server "${shortName}" already exists in ${scope} scope.`)
  }

  mcpServers[shortName] = config
  settings.mcpServers = mcpServers
  await writeSettingsFile(filePath, settings)

  return {}
}

async function getInstalledServerNames(): Promise<{ names: string[] }> {
  const names = new Set<string>()

  // Global settings
  const globalSettings = await readSettingsFile(getGlobalSettingsPath())
  for (const name of Object.keys((globalSettings.mcpServers ?? {}) as ServerMap)) {
    names.add(name)
  }
  for (const name of Object.keys((globalSettings.disabledMcpServers ?? {}) as ServerMap)) {
    names.add(name)
  }

  // Project settings
  const projectRoot = resolveProjectRoot()
  if (projectRoot) {
    const projectSettings = await readSettingsFile(getProjectSettingsPath(projectRoot))
    for (const name of Object.keys((projectSettings.mcpServers ?? {}) as ServerMap)) {
      names.add(name)
    }
    for (const name of Object.keys((projectSettings.disabledMcpServers ?? {}) as ServerMap)) {
      names.add(name)
    }
  }

  return { names: [...names] }
}

// ─── Registration ─────────────────────────────────────────────────────

export function registerMcpStoreHandlers(_senderWindow: SenderWindow): string[] {
  const channels: string[] = []
  void _senderWindow

  registerHandler(channels, 'mcpStore:search', async (_event, query: string, cursor?: string) =>
    runHandler(() => searchServers(query, cursor)),
  )

  registerHandler(channels, 'mcpStore:getDetails', async (_event, name: string) =>
    runHandler(() => getServerDetails(name)),
  )

  registerHandler(channels, 'mcpStore:install', async (_event, server: McpRegistryServer, scope: 'global' | 'project') =>
    runHandler(() => installServer(server, scope)),
  )

  registerHandler(channels, 'mcpStore:getInstalled', async () =>
    runHandler(() => getInstalledServerNames()),
  )

  return channels
}
