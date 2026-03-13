/**
 * ipc-handlers/config.ts — Config IPC handlers
 */

import { ipcMain, dialog, shell, app, BrowserWindow, IpcMainInvokeEvent } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import chokidar, { FSWatcher } from 'chokidar'
import { getConfig, getConfigValue, setConfigValue, AppConfig } from '../config'

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow

/** Config keys that can be imported/synced from external JSON files. */
const IMPORTABLE_KEYS: (keyof AppConfig)[] = [
  'recentProjects', 'defaultProjectRoot', 'activeTheme', 'hooksServerPort',
  'terminalFontSize', 'autoInstallHooks', 'shell', 'panelSizes', 'windowBounds',
  'fontUI', 'fontMono', 'fontSizeUI', 'keybindings', 'showBgGradient',
  'customThemeColors', 'terminalSessions', 'claudeCliSettings', 'customCSS',
  'bookmarks', 'fileTreeIgnorePatterns', 'profiles',
]

// Settings file watcher
let settingsFileWatcher: FSWatcher | null = null

export function registerConfigHandlers(senderWindow: SenderWindow): string[] {
  const channels: string[] = []

  ipcMain.handle('config:getAll', () => {
    return getConfig()
  })
  channels.push('config:getAll')

  ipcMain.handle('config:get', (_event, key: keyof AppConfig) => {
    return getConfigValue(key)
  })
  channels.push('config:get')

  ipcMain.handle('config:set', (_event, key: keyof AppConfig, value: AppConfig[typeof key]) => {
    try {
      setConfigValue(key, value)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('config:set')

  // ─── Config export ────────────────────────────────────────────────────────

  ipcMain.handle('config:export', async (event) => {
    try {
      const result = await dialog.showSaveDialog(senderWindow(event), {
        title: 'Export Settings',
        defaultPath: 'agent-ide-settings.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (result.canceled || !result.filePath) {
        return { success: true, cancelled: true }
      }
      const config = getConfig()
      await fs.writeFile(result.filePath, JSON.stringify(config, null, 2), 'utf-8')
      return { success: true, filePath: result.filePath }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('config:export')

  // ─── Config import ────────────────────────────────────────────────────────

  ipcMain.handle('config:import', async (event) => {
    try {
      const result = await dialog.showOpenDialog(senderWindow(event), {
        title: 'Import Settings',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, cancelled: true }
      }
      const raw = await fs.readFile(result.filePaths[0], 'utf-8')
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return { success: false, error: 'File is not valid JSON.' }
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { success: false, error: 'Settings file must be a JSON object.' }
      }
      // Apply only known config keys
      const incoming = parsed as Record<string, unknown>
      for (const key of IMPORTABLE_KEYS) {
        if (key in incoming) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setConfigValue(key, incoming[key] as any)
          } catch {
            // skip keys that fail schema validation
          }
        }
      }
      const merged = getConfig()
      return { success: true, config: merged }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('config:import')

  // ─── Open settings.json file ──────────────────────────────────────────────

  const settingsFilePath = path.join(app.getPath('userData'), 'settings.json')

  async function writeSettingsFile(): Promise<void> {
    const config = getConfig()
    await fs.writeFile(settingsFilePath, JSON.stringify(config, null, 2), 'utf-8')
  }

  function startSettingsFileWatcher(): void {
    if (settingsFileWatcher) return

    settingsFileWatcher = chokidar.watch(settingsFilePath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    })

    settingsFileWatcher.on('change', async () => {
      try {
        const raw = await fs.readFile(settingsFilePath, 'utf-8')
        const parsed = JSON.parse(raw)
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return

        const incoming = parsed as Record<string, unknown>
        for (const key of IMPORTABLE_KEYS) {
          if (key in incoming) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              setConfigValue(key, incoming[key] as any)
            } catch {
              // skip invalid values
            }
          }
        }
        // Notify all renderer windows of the external change
        const updated = getConfig()
        for (const bw of BrowserWindow.getAllWindows()) {
          if (!bw.isDestroyed()) {
            bw.webContents.send('config:externalChange', updated)
          }
        }
      } catch {
        // Ignore parse errors from in-progress edits
      }
    })
  }

  ipcMain.handle('config:openSettingsFile', async () => {
    try {
      await writeSettingsFile()
      startSettingsFileWatcher()
      await shell.openPath(settingsFilePath)
      return { success: true, filePath: settingsFilePath }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('config:openSettingsFile')

  return channels
}

export function cleanupConfigWatcher(): void {
  if (settingsFileWatcher) {
    settingsFileWatcher.close().catch(() => {})
    settingsFileWatcher = null
  }
}
