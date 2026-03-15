/**
 * ipc-handlers/config.ts - Config IPC handlers
 */

import { app, BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent, shell } from 'electron'
import chokidar, { FSWatcher } from 'chokidar'
import fs from 'fs/promises'
import path from 'path'
import { AppConfig, getConfig, getConfigValue, setConfigValue } from '../config'

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow
type ConfigInvokeHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

interface ConfigHandlerEntry {
  channel: string
  handler: ConfigInvokeHandler
}

/** Config keys that can be imported/synced from external JSON files. */
const IMPORTABLE_KEYS: (keyof AppConfig)[] = [
  'recentProjects', 'defaultProjectRoot', 'activeTheme', 'hooksServerPort',
  'terminalFontSize', 'terminalCursorStyle', 'autoInstallHooks', 'shell', 'panelSizes', 'windowBounds',
  'fontUI', 'fontMono', 'fontSizeUI', 'keybindings', 'showBgGradient',
  'customThemeColors', 'terminalSessions', 'claudeCliSettings', 'customCSS',
  'bookmarks', 'fileTreeIgnorePatterns', 'profiles',
]

let settingsFileWatcher: FSWatcher | null = null

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseConfigObject(raw: string, invalidJsonMessage: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    if (invalidJsonMessage) {
      throw new Error(invalidJsonMessage)
    }
    return null
  }
}

function applyImportableConfig(incoming: Record<string, unknown>): void {
  for (const key of IMPORTABLE_KEYS) {
    if (!(key in incoming)) {
      continue
    }

    try {
      setConfigValue(key, incoming[key] as AppConfig[typeof key])
    } catch {
      // Skip keys that fail schema validation.
    }
  }
}

function notifyExternalConfigChange(updated: AppConfig): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue
    }
    window.webContents.send('config:externalChange', updated)
  }
}

function registerHandlers(entries: ConfigHandlerEntry[], channels: string[]): void {
  for (const entry of entries) {
    ipcMain.handle(entry.channel, entry.handler)
    channels.push(entry.channel)
  }
}

function createCoreHandlers(): ConfigHandlerEntry[] {
  return [
    {
      channel: 'config:getAll',
      handler: () => getConfig(),
    },
    {
      channel: 'config:get',
      handler: (_event, key) => getConfigValue(key as keyof AppConfig),
    },
    {
      channel: 'config:set',
      handler: (_event, key, value) => {
        try {
          setConfigValue(key as keyof AppConfig, value as AppConfig[keyof AppConfig])
          return { success: true }
        } catch (error) {
          return { success: false, error: toErrorMessage(error) }
        }
      },
    },
  ]
}

async function exportConfigFile(window: BrowserWindow): Promise<{ success: boolean; cancelled?: boolean; filePath?: string; error?: string }> {
  try {
    const result = await dialog.showSaveDialog(window, {
      title: 'Export Settings',
      defaultPath: 'agent-ide-settings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })

    if (result.canceled || !result.filePath) {
      return { success: true, cancelled: true }
    }

    await fs.writeFile(result.filePath, JSON.stringify(getConfig(), null, 2), 'utf-8')
    return { success: true, filePath: result.filePath }
  } catch (error) {
    return { success: false, error: toErrorMessage(error) }
  }
}

async function importConfigFile(window: BrowserWindow): Promise<{ success: boolean; cancelled?: boolean; config?: AppConfig; error?: string }> {
  try {
    const result = await dialog.showOpenDialog(window, {
      title: 'Import Settings',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, cancelled: true }
    }

    const raw = await fs.readFile(result.filePaths[0], 'utf-8')
    const incoming = parseConfigObject(raw, 'File is not valid JSON.')
    if (!incoming) {
      return { success: false, error: 'Settings file must be a JSON object.' }
    }

    applyImportableConfig(incoming)
    return { success: true, config: getConfig() }
  } catch (error) {
    return { success: false, error: toErrorMessage(error) }
  }
}

async function writeSettingsFile(settingsFilePath: string): Promise<void> {
  await fs.writeFile(settingsFilePath, JSON.stringify(getConfig(), null, 2), 'utf-8')
}

async function syncExternalSettings(settingsFilePath: string): Promise<void> {
  try {
    const raw = await fs.readFile(settingsFilePath, 'utf-8')
    const incoming = parseConfigObject(raw, '')
    if (!incoming) {
      return
    }

    applyImportableConfig(incoming)
    notifyExternalConfigChange(getConfig())
  } catch {
    // Ignore parse errors from in-progress edits.
  }
}

function startSettingsFileWatcher(settingsFilePath: string): void {
  if (settingsFileWatcher) {
    return
  }

  settingsFileWatcher = chokidar.watch(settingsFilePath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  })

  settingsFileWatcher.on('change', () => {
    void syncExternalSettings(settingsFilePath)
  })
}

function createDialogHandlers(
  senderWindow: SenderWindow,
  settingsFilePath: string,
): ConfigHandlerEntry[] {
  return [
    {
      channel: 'config:export',
      handler: (event) => exportConfigFile(senderWindow(event)),
    },
    {
      channel: 'config:import',
      handler: (event) => importConfigFile(senderWindow(event)),
    },
    {
      channel: 'config:openSettingsFile',
      handler: async () => {
        try {
          await writeSettingsFile(settingsFilePath)
          startSettingsFileWatcher(settingsFilePath)
          await shell.openPath(settingsFilePath)
          return { success: true, filePath: settingsFilePath }
        } catch (error) {
          return { success: false, error: toErrorMessage(error) }
        }
      },
    },
  ]
}

export function registerConfigHandlers(senderWindow: SenderWindow): string[] {
  const channels: string[] = []
  const settingsFilePath = path.join(app.getPath('userData'), 'settings.json')

  registerHandlers(createCoreHandlers(), channels)
  registerHandlers(createDialogHandlers(senderWindow, settingsFilePath), channels)

  return channels
}

export function cleanupConfigWatcher(): void {
  if (!settingsFileWatcher) {
    return
  }

  settingsFileWatcher.close().catch(() => {})
  settingsFileWatcher = null
}
