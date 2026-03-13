/**
 * codemodeManager.ts — Orchestrates Code Mode lifecycle.
 *
 * Reads MCP server configs from Claude Code's settings files,
 * writes a proxy config, injects a __codemode_proxy MCP entry,
 * and toggles the original servers on/off.
 */

import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import type { CodeModeStatusResult } from './types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface McpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

export interface McpServerEntry {
  name: string
  config: McpServerConfig
  scope: 'global' | 'project'
  enabled: boolean
}

// ─── Module state ─────────────────────────────────────────────────────────────

let codemodeEnabled = false
let proxiedServerNames: string[] = []
let disabledByUs = new Set<string>()
let activeScope: 'global' | 'project' = 'global'
let activeProjectRoot: string | undefined
let generatedTypesCache = ''

// ─── Settings file paths ──────────────────────────────────────────────────────

function getGlobalSettingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json')
}

function getProjectSettingsPath(projectRoot: string): string {
  return path.join(projectRoot, '.claude', 'settings.json')
}

function getSettingsPath(scope: 'global' | 'project', projectRoot?: string): string {
  if (scope === 'project' && projectRoot) {
    return getProjectSettingsPath(projectRoot)
  }
  return getGlobalSettingsPath()
}

// ─── Settings I/O ─────────────────────────────────────────────────────────────

async function readSettingsFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function writeSettingsFile(filePath: string, data: Record<string, unknown>): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmpPath = filePath + '.tmp'
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  await fs.rename(tmpPath, filePath)
}

// ─── Config file path ─────────────────────────────────────────────────────────

const PROXY_CONFIG_PATH = path.join(os.tmpdir(), 'codemode-proxy-config.json')

// ─── Read all MCP servers ─────────────────────────────────────────────────────

export async function getMcpServers(projectRoot?: string): Promise<McpServerEntry[]> {
  const entries: McpServerEntry[] = []

  // Global servers
  const globalSettings = await readSettingsFile(getGlobalSettingsPath())
  const globalMcp = (globalSettings.mcpServers ?? {}) as Record<string, McpServerConfig>
  const globalDisabled = (globalSettings.disabledMcpServers ?? {}) as Record<string, McpServerConfig>

  for (const [name, config] of Object.entries(globalMcp)) {
    entries.push({ name, config, scope: 'global', enabled: true })
  }
  for (const [name, config] of Object.entries(globalDisabled)) {
    entries.push({ name, config, scope: 'global', enabled: false })
  }

  // Project servers
  if (projectRoot) {
    const projectSettings = await readSettingsFile(getProjectSettingsPath(projectRoot))
    const projectMcp = (projectSettings.mcpServers ?? {}) as Record<string, McpServerConfig>
    const projectDisabled = (projectSettings.disabledMcpServers ?? {}) as Record<string, McpServerConfig>

    for (const [name, config] of Object.entries(projectMcp)) {
      entries.push({ name, config, scope: 'project', enabled: true })
    }
    for (const [name, config] of Object.entries(projectDisabled)) {
      entries.push({ name, config, scope: 'project', enabled: false })
    }
  }

  return entries
}

function getServerMaps(settings: Record<string, unknown>): {
  mcpServers: Record<string, McpServerConfig>
  disabledMcp: Record<string, McpServerConfig>
} {
  return {
    mcpServers: (settings.mcpServers ?? {}) as Record<string, McpServerConfig>,
    disabledMcp: (settings.disabledMcpServers ?? {}) as Record<string, McpServerConfig>,
  }
}

function collectServersToProxy(
  serverNames: string[],
  mcpServers: Record<string, McpServerConfig>
): Record<string, McpServerConfig> {
  const serversToProxy: Record<string, McpServerConfig> = {}
  for (const name of serverNames) {
    if (mcpServers[name]) {
      serversToProxy[name] = mcpServers[name]
    }
  }
  return serversToProxy
}

async function writeProxyConfig(serversToProxy: Record<string, McpServerConfig>): Promise<void> {
  const proxyConfig = { servers: serversToProxy }
  await fs.writeFile(PROXY_CONFIG_PATH, JSON.stringify(proxyConfig, null, 2), 'utf-8')
}

function buildProxyServerEntry(): McpServerConfig {
  const proxyServerPath = path.join(__dirname, 'proxyServer.js')
  return {
    command: 'node',
    args: [proxyServerPath, PROXY_CONFIG_PATH],
  }
}

function moveProxiedServersToDisabled(
  serverNames: string[],
  mcpServers: Record<string, McpServerConfig>,
  disabledMcp: Record<string, McpServerConfig>
): Set<string> {
  const newDisabledByUs = new Set<string>()
  for (const name of serverNames) {
    disabledMcp[name] = mcpServers[name]
    delete mcpServers[name]
    newDisabledByUs.add(name)
  }
  return newDisabledByUs
}

async function persistServerMaps(
  settingsPath: string,
  settings: Record<string, unknown>,
  mcpServers: Record<string, McpServerConfig>,
  disabledMcp: Record<string, McpServerConfig>
): Promise<void> {
  settings.mcpServers = mcpServers
  settings.disabledMcpServers = disabledMcp
  await writeSettingsFile(settingsPath, settings)
}

function updateCodeModeState(
  scope: 'global' | 'project',
  projectRoot: string | undefined,
  proxiedServers: string[],
  newDisabledByUs: Set<string>
): void {
  codemodeEnabled = true
  proxiedServerNames = proxiedServers
  disabledByUs = newDisabledByUs
  activeScope = scope
  activeProjectRoot = projectRoot
  generatedTypesCache = ''
}

// ─── Enable Code Mode ─────────────────────────────────────────────────────────

export async function enableCodeMode(
  serverNames: string[],
  scope: 'global' | 'project',
  projectRoot?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (codemodeEnabled) {
      return { success: false, error: 'Code Mode is already enabled. Disable it first.' }
    }

    const settingsPath = getSettingsPath(scope, projectRoot)
    const settings = await readSettingsFile(settingsPath)

    const { mcpServers, disabledMcp } = getServerMaps(settings)
    const serversToProxy = collectServersToProxy(serverNames, mcpServers)

    if (Object.keys(serversToProxy).length === 0) {
      return { success: false, error: 'None of the requested MCP servers were found in settings.' }
    }

    await writeProxyConfig(serversToProxy)
    mcpServers['__codemode_proxy'] = buildProxyServerEntry()

    const proxiedNames = Object.keys(serversToProxy)
    const newDisabledByUs = moveProxiedServersToDisabled(proxiedNames, mcpServers, disabledMcp)

    await persistServerMaps(settingsPath, settings, mcpServers, disabledMcp)
    updateCodeModeState(scope, projectRoot, proxiedNames, newDisabledByUs)

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Disable Code Mode ───────────────────────────────────────────────────────

export async function disableCodeMode(): Promise<{ success: boolean; error?: string }> {
  try {
    if (!codemodeEnabled) {
      return { success: false, error: 'Code Mode is not currently enabled.' }
    }

    const settingsPath = getSettingsPath(activeScope, activeProjectRoot)
    const settings = await readSettingsFile(settingsPath)

    const mcpServers = (settings.mcpServers ?? {}) as Record<string, McpServerConfig>
    const disabledMcp = (settings.disabledMcpServers ?? {}) as Record<string, McpServerConfig>

    // Remove the proxy entry
    delete mcpServers['__codemode_proxy']

    // Move our disabled servers back to mcpServers
    for (const name of Array.from(disabledByUs)) {
      if (disabledMcp[name]) {
        mcpServers[name] = disabledMcp[name]
        delete disabledMcp[name]
      }
    }

    // Write settings back
    settings.mcpServers = mcpServers
    settings.disabledMcpServers = disabledMcp
    await writeSettingsFile(settingsPath, settings)

    // Clean up the proxy config temp file
    try {
      await fs.unlink(PROXY_CONFIG_PATH)
    } catch {
      // Non-fatal if file already gone
    }

    // Clear module state
    codemodeEnabled = false
    proxiedServerNames = []
    disabledByUs = new Set<string>()
    activeProjectRoot = undefined
    generatedTypesCache = ''

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Status queries ───────────────────────────────────────────────────────────

export function getCodeModeStatus(): CodeModeStatusResult {
  return {
    enabled: codemodeEnabled,
    proxiedServers: [...proxiedServerNames],
    generatedTypes: generatedTypesCache,
  }
}

export function isCodeModeEnabled(): boolean {
  return codemodeEnabled
}
