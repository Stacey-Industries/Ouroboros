/**
 * ipc.ts â€” Orchestrator that registers all ipcMain handlers by delegating
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

function registerDomainHandlers(win: BrowserWindow): string[] {
  return [
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
}

async function withCodeModeManager<T>(
  action: (manager: typeof import('./codemode/codemodeManager')) => Promise<T> | T
): Promise<T | { success: false; error: string }> {
  try {
    const manager = await import('./codemode/codemodeManager')
    return await action(manager)
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function registerCodeModeHandlers(channels: string[]): void {
  ipcMain.handle('codemode:enable', (_event, args: { serverNames: string[]; scope: 'global' | 'project'; projectRoot?: string }) =>
    withCodeModeManager((manager) => manager.enableCodeMode(args.serverNames, args.scope, args.projectRoot))
  )
  ipcMain.handle('codemode:disable', () => withCodeModeManager((manager) => manager.disableCodeMode()))
  ipcMain.handle('codemode:status', () =>
    withCodeModeManager((manager) => ({ success: true, ...manager.getCodeModeStatus() }))
  )
  channels.push('codemode:enable', 'codemode:disable', 'codemode:status')
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
    return () => { /* no-op â€” handled globally */ }
  }

  handlersRegistered = true
  allChannels = registerDomainHandlers(win)
  registerCodeModeHandlers(allChannels)

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
