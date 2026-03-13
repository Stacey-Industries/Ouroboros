/**
 * ipc.ts — Orchestrator that registers all ipcMain handlers by delegating
 * to domain-specific modules in ./ipc-handlers/.
 *
 * Channels mirror the contextBridge API shape in preload.ts.
 * All handlers return serialisable values (no class instances).
 */

import { ipcMain, BrowserWindow, IpcMainInvokeEvent } from 'electron'
import {
  registerPtyHandlers,
  registerConfigHandlers, cleanupConfigWatcher,
  registerFileHandlers, cleanupFileWatchers,
  registerGitHandlers,
  registerAppHandlers,
  registerSessionHandlers,
  registerMiscHandlers, lspStopAll,
  registerMcpHandlers,
  registerContextHandlers,
  registerIdeToolsHandlers,
} from './ipc-handlers'

/** Resolve the BrowserWindow that sent an IPC event. */
function senderWindow(event: IpcMainInvokeEvent): BrowserWindow {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) throw new Error('IPC event from unknown window')
  return win
}

let handlersRegistered = false
let allChannels: string[] = []

/**
 * Register all ipcMain handlers. Handlers are registered globally (once) and
 * use `event.sender` to determine the calling window. Returns a cleanup
 * function that removes the handlers; only the *last* cleanup call actually
 * unregisters (since handlers are shared across windows).
 */
export function registerIpcHandlers(win: BrowserWindow): () => void {
  if (handlersRegistered) {
    // Handlers already registered — return no-op cleanup.
    // Actual cleanup happens in cleanupIpcHandlers().
    return () => { /* no-op — handled globally */ }
  }
  handlersRegistered = true

  allChannels = [
    ...registerPtyHandlers(senderWindow),
    ...registerConfigHandlers(senderWindow),
    ...registerFileHandlers(senderWindow),
    ...registerGitHandlers(senderWindow),
    ...registerAppHandlers(senderWindow),
    ...registerSessionHandlers(senderWindow),
    ...registerMiscHandlers(senderWindow, win),
    ...registerMcpHandlers(senderWindow),
    ...registerContextHandlers(senderWindow),
    ...registerIdeToolsHandlers(senderWindow),
  ]

  // ─── Code Mode ────────────────────────────────────────────────────────────

  ipcMain.handle('codemode:enable', async (_event, args: { serverNames: string[]; scope: 'global' | 'project'; projectRoot?: string }) => {
    try {
      const { enableCodeMode } = await import('./codemode/codemodeManager')
      return await enableCodeMode(args.serverNames, args.scope, args.projectRoot)
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('codemode:disable', async () => {
    try {
      const { disableCodeMode } = await import('./codemode/codemodeManager')
      return await disableCodeMode()
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('codemode:status', async () => {
    try {
      const { getCodeModeStatus } = await import('./codemode/codemodeManager')
      return { success: true, ...getCodeModeStatus() }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  allChannels.push('codemode:enable', 'codemode:disable', 'codemode:status')

  // Return a cleanup function
  return () => { cleanupIpcHandlers() }
}

export function cleanupIpcHandlers(): void {
  // Close all file watchers
  cleanupFileWatchers()

  // Close settings file watcher
  cleanupConfigWatcher()

  // Stop all LSP servers
  lspStopAll().catch(() => {})

  // Remove all handlers
  for (const channel of allChannels) {
    ipcMain.removeHandler(channel)
  }

  allChannels = []
  handlersRegistered = false
}
