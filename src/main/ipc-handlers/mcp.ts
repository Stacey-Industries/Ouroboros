/**
 * ipc-handlers/mcp.ts — IPC handlers for managing MCP (Model Context Protocol)
 * server configurations in Claude Code's settings files.
 *
 * Reads and writes to:
 *  - ~/.claude/settings.json (global scope)
 *  - <projectRoot>/.claude/settings.json (project scope)
 */

import { ipcMain, BrowserWindow, IpcMainInvokeEvent } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { store } from '../config'

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow

// ─── Types ────────────────────────────────────────────────────────────────────

export interface McpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** URL for SSE/streamable-http transport servers */
  url?: string
}

export interface McpServerEntry {
  name: string
  config: McpServerConfig
  scope: 'global' | 'project'
  enabled: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGlobalSettingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json')
}

function getProjectSettingsPath(projectRoot: string): string {
  return path.join(projectRoot, '.claude', 'settings.json')
}

async function readSettingsFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function writeSettingsFile(filePath: string, data: Record<string, unknown>): Promise<void> {
  // Ensure parent directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function extractServers(
  settings: Record<string, unknown>,
  scope: 'global' | 'project',
): McpServerEntry[] {
  const entries: McpServerEntry[] = []

  const mcpServers = (settings.mcpServers ?? {}) as Record<string, McpServerConfig>
  for (const [name, config] of Object.entries(mcpServers)) {
    entries.push({ name, config, scope, enabled: true })
  }

  // Claude Code uses "disabledMcpServers" for servers that are toggled off
  const disabledServers = (settings.disabledMcpServers ?? {}) as Record<string, McpServerConfig>
  for (const [name, config] of Object.entries(disabledServers)) {
    entries.push({ name, config, scope, enabled: false })
  }

  return entries
}

/** Try to get project root from the stored config. */
function getProjectRoot(_win: BrowserWindow): string | null {
  try {
    const roots: string[] = store.get('multiRoots', [])
    if (roots.length > 0) return roots[0]
    const defaultRoot: string = store.get('defaultProjectRoot', '')
    if (defaultRoot) return defaultRoot
  } catch {
    // Fall through
  }
  return null
}

// ─── Handler Registration ─────────────────────────────────────────────────────

export function registerMcpHandlers(senderWindow: SenderWindow): string[] {
  const channels: string[] = []

  // ── Get all servers ──────────────────────────────────────────────────────

  ipcMain.handle('mcp:getServers', async (event, opts?: { projectRoot?: string }) => {
    try {
      const win = senderWindow(event)
      const globalPath = getGlobalSettingsPath()
      const globalSettings = await readSettingsFile(globalPath)
      const servers: McpServerEntry[] = extractServers(globalSettings, 'global')

      // Try project scope
      const projectRoot = opts?.projectRoot ?? getProjectRoot(win)
      if (projectRoot) {
        const projectPath = getProjectSettingsPath(projectRoot)
        const projectSettings = await readSettingsFile(projectPath)
        servers.push(...extractServers(projectSettings, 'project'))
      }

      return { success: true, servers }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('mcp:getServers')

  // ── Add a server ─────────────────────────────────────────────────────────

  ipcMain.handle('mcp:addServer', async (event, args: { name: string; config: McpServerConfig; scope: 'global' | 'project'; projectRoot?: string }) => {
    try {
      const win = senderWindow(event)
      const { name, config, scope, projectRoot: explicitRoot } = args

      const filePath = scope === 'global'
        ? getGlobalSettingsPath()
        : getProjectSettingsPath(explicitRoot ?? getProjectRoot(win) ?? '')

      if (scope === 'project' && !explicitRoot && !getProjectRoot(win)) {
        return { success: false, error: 'No project root available for project-scoped server.' }
      }

      const settings = await readSettingsFile(filePath)
      const mcpServers = (settings.mcpServers ?? {}) as Record<string, McpServerConfig>

      if (mcpServers[name]) {
        return { success: false, error: `Server "${name}" already exists in ${scope} scope.` }
      }

      mcpServers[name] = config
      settings.mcpServers = mcpServers

      await writeSettingsFile(filePath, settings)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('mcp:addServer')

  // ── Remove a server ──────────────────────────────────────────────────────

  ipcMain.handle('mcp:removeServer', async (event, args: { name: string; scope: 'global' | 'project'; projectRoot?: string }) => {
    try {
      const win = senderWindow(event)
      const { name, scope, projectRoot: explicitRoot } = args

      const filePath = scope === 'global'
        ? getGlobalSettingsPath()
        : getProjectSettingsPath(explicitRoot ?? getProjectRoot(win) ?? '')

      const settings = await readSettingsFile(filePath)

      // Remove from both mcpServers and disabledMcpServers
      const mcpServers = (settings.mcpServers ?? {}) as Record<string, McpServerConfig>
      const disabledServers = (settings.disabledMcpServers ?? {}) as Record<string, McpServerConfig>

      delete mcpServers[name]
      delete disabledServers[name]

      settings.mcpServers = mcpServers
      if (Object.keys(disabledServers).length > 0) {
        settings.disabledMcpServers = disabledServers
      } else {
        delete settings.disabledMcpServers
      }

      await writeSettingsFile(filePath, settings)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('mcp:removeServer')

  // ── Update a server ──────────────────────────────────────────────────────

  ipcMain.handle('mcp:updateServer', async (event, args: { name: string; config: McpServerConfig; scope: 'global' | 'project'; projectRoot?: string }) => {
    try {
      const win = senderWindow(event)
      const { name, config, scope, projectRoot: explicitRoot } = args

      const filePath = scope === 'global'
        ? getGlobalSettingsPath()
        : getProjectSettingsPath(explicitRoot ?? getProjectRoot(win) ?? '')

      const settings = await readSettingsFile(filePath)

      // Check which bucket the server is in
      const mcpServers = (settings.mcpServers ?? {}) as Record<string, McpServerConfig>
      const disabledServers = (settings.disabledMcpServers ?? {}) as Record<string, McpServerConfig>

      if (mcpServers[name]) {
        mcpServers[name] = config
        settings.mcpServers = mcpServers
      } else if (disabledServers[name]) {
        disabledServers[name] = config
        settings.disabledMcpServers = disabledServers
      } else {
        return { success: false, error: `Server "${name}" not found in ${scope} scope.` }
      }

      await writeSettingsFile(filePath, settings)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('mcp:updateServer')

  // ── Toggle a server (enable/disable) ─────────────────────────────────────

  ipcMain.handle('mcp:toggleServer', async (event, args: { name: string; enabled: boolean; scope: 'global' | 'project'; projectRoot?: string }) => {
    try {
      const win = senderWindow(event)
      const { name, enabled, scope, projectRoot: explicitRoot } = args

      const filePath = scope === 'global'
        ? getGlobalSettingsPath()
        : getProjectSettingsPath(explicitRoot ?? getProjectRoot(win) ?? '')

      const settings = await readSettingsFile(filePath)
      const mcpServers = (settings.mcpServers ?? {}) as Record<string, McpServerConfig>
      const disabledServers = (settings.disabledMcpServers ?? {}) as Record<string, McpServerConfig>

      if (enabled) {
        // Move from disabled → enabled
        const config = disabledServers[name]
        if (!config) {
          return { success: false, error: `Server "${name}" not found in disabled servers.` }
        }
        mcpServers[name] = config
        delete disabledServers[name]
      } else {
        // Move from enabled → disabled
        const config = mcpServers[name]
        if (!config) {
          return { success: false, error: `Server "${name}" not found in enabled servers.` }
        }
        disabledServers[name] = config
        delete mcpServers[name]
      }

      settings.mcpServers = mcpServers
      if (Object.keys(disabledServers).length > 0) {
        settings.disabledMcpServers = disabledServers
      } else {
        delete settings.disabledMcpServers
      }

      await writeSettingsFile(filePath, settings)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('mcp:toggleServer')

  return channels
}
