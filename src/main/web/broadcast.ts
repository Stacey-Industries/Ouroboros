/**
 * broadcast.ts — Unified event broadcast to Electron windows AND web clients.
 *
 * All event broadcasting in the main process should go through this module
 * so that both local Electron windows and remote WebSocket clients receive
 * the same events.
 */

import { getAllActiveWindows } from '../windowManager'
import { broadcastToWebClients } from './webServer'

/**
 * Broadcasts an event to all Electron BrowserWindows and all connected
 * WebSocket clients.
 *
 * @param channel - The event channel name (e.g. "hooks:event", "pty:data:123")
 * @param payload - The event payload (must be JSON-serializable)
 */
export function broadcast(channel: string, payload: unknown): void {
  // Send to Electron windows
  for (const win of getAllActiveWindows()) {
    try {
      if (!win.isDestroyed()) {
        win.webContents.mainFrame.send(channel, payload)
      }
    } catch {
      // Render frame disposed — safe to skip
    }
  }

  // Send to WebSocket clients
  broadcastToWebClients(channel, payload)
}
