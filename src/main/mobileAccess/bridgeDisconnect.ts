/**
 * bridgeDisconnect.ts — Real device socket disconnection implementation.
 *
 * Tracks open WebSocket connections per deviceId. When Phase B's
 * revokePairedDevice handler runs, disconnectDevice() closes every
 * socket tagged with that device and returns the count closed.
 *
 * Wave 33a Phase D — replaces bridgeDisconnectStub.ts.
 */

import { WebSocket } from 'ws';

import log from '../logger';

// ─── State ────────────────────────────────────────────────────────────────────

/** Map from deviceId → set of open WebSocket connections. */
const connectionsByDevice = new Map<string, Set<WebSocket>>();

/** Reverse lookup: ws → deviceId, for O(1) unregister. */
const deviceByConnection = new Map<WebSocket, string>();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Registers a WebSocket connection as belonging to a device.
 * Called when a mobile client successfully authenticates at WS upgrade.
 */
export function registerConnection(deviceId: string, ws: WebSocket): void {
  let sockets = connectionsByDevice.get(deviceId);
  if (!sockets) {
    sockets = new Set();
    connectionsByDevice.set(deviceId, sockets);
  }
  sockets.add(ws);
  deviceByConnection.set(ws, deviceId);
  log.info(`[bridgeDisconnect] registered ws for device=${deviceId}`);
}

/**
 * Removes a WebSocket from the tracking maps.
 * Called on 'close' and 'error' events in webSocketBridge.ts.
 */
export function unregisterConnection(ws: WebSocket): void {
  const deviceId = deviceByConnection.get(ws);
  if (!deviceId) return;
  deviceByConnection.delete(ws);
  const sockets = connectionsByDevice.get(deviceId);
  if (sockets) {
    sockets.delete(ws);
    if (sockets.size === 0) connectionsByDevice.delete(deviceId);
  }
}

/**
 * Closes all open sockets for a device with code 4002 'revoked'.
 * Called by Phase B's revokePairedDevice handler.
 * @returns Number of sockets that were closed.
 */
export function disconnectDevice(deviceId: string): number {
  const sockets = connectionsByDevice.get(deviceId);
  if (!sockets || sockets.size === 0) return 0;

  let count = 0;
  for (const ws of sockets) {
    try {
      ws.close(4002, 'revoked');
      count++;
    } catch (err) {
      log.warn(`[bridgeDisconnect] close error for device=${deviceId}:`, err);
    }
  }
  log.info(`[bridgeDisconnect] disconnected ${count} socket(s) for device=${deviceId}`);
  return count;
}

/**
 * Returns number of tracked open connections (all devices).
 * For diagnostics only.
 */
export function getTrackedConnectionCount(): number {
  let total = 0;
  for (const sockets of connectionsByDevice.values()) {
    total += sockets.size;
  }
  return total;
}
