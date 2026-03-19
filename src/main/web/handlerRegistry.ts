/**
 * handlerRegistry.ts — Shared IPC handler registry.
 *
 * Stores handler functions alongside ipcMain.handle registration so that
 * the WebSocket bridge can call the same handlers without going through
 * Electron IPC internals.
 *
 * Two capture strategies are provided:
 *
 * 1. **installHandlerCapture()** — Monkey-patches `ipcMain.handle` so that
 *    every subsequent call (from any handler file) automatically stores the
 *    handler in the registry. Call this once, before any handler registration.
 *    This is the primary mechanism and requires zero changes to handler files.
 *
 * 2. **registerHandler()** — Explicit helper that registers with both
 *    ipcMain and the registry. Useful for new code that wants to be explicit.
 */

import { ipcMain } from 'electron'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IpcHandler = (...args: any[]) => Promise<any>

/**
 * Map of IPC channel names to their handler functions.
 * Populated automatically by the ipcMain.handle capture, or explicitly
 * via registerHandler() calls.
 */
export const ipcHandlerRegistry = new Map<string, IpcHandler>()

let captureInstalled = false

/**
 * Monkey-patches `ipcMain.handle` to also store every handler in the
 * shared registry. Call this ONCE during startup, BEFORE any handler
 * registration (i.e. before `registerIpcHandlers` / `createWindow`).
 *
 * The original `ipcMain.handle` still works normally for Electron IPC —
 * we simply intercept it to grab a reference to each handler function.
 */
export function installHandlerCapture(): void {
  if (captureInstalled) return
  captureInstalled = true

  const originalHandle = ipcMain.handle.bind(ipcMain)

  ipcMain.handle = ((channel: string, handler: IpcHandler) => {
    ipcHandlerRegistry.set(channel, handler)
    return originalHandle(channel, handler)
  }) as typeof ipcMain.handle
}

/**
 * Returns the handler registered for a given IPC channel, or undefined.
 */
export function getHandler(channel: string): IpcHandler | undefined {
  return ipcHandlerRegistry.get(channel)
}

/**
 * Returns all registered IPC channel names.
 */
export function getAllChannels(): string[] {
  return Array.from(ipcHandlerRegistry.keys())
}

/**
 * Removes a handler from the registry (called during cleanup).
 * Does NOT call ipcMain.removeHandler — that is handled separately.
 */
export function removeHandler(channel: string): void {
  ipcHandlerRegistry.delete(channel)
}

/**
 * Clears all handlers from the registry.
 */
export function clearRegistry(): void {
  ipcHandlerRegistry.clear()
}

/**
 * Registers an IPC handler with both Electron's ipcMain and the shared registry.
 * Explicit alternative to the monkey-patch capture for new code.
 *
 * @param channels - Array to push the channel name into (for cleanup tracking)
 * @param channel - The IPC channel name (e.g. "git:status")
 * @param handler - The async handler function
 */
export function registerHandler(
  channels: string[],
  channel: string,
  handler: IpcHandler
): void {
  ipcMain.handle(channel, handler)
  // Also store in registry (idempotent if capture is installed)
  ipcHandlerRegistry.set(channel, handler)
  channels.push(channel)
}
