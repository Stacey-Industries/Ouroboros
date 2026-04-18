/**
 * bridgeDisconnectStub.ts — Stub for device socket disconnection.
 *
 * Phase D (WS authentication hardening) will replace this with the real
 * implementation that walks active WebSocket connections and closes any
 * socket tagged with the given deviceId.
 *
 * Wave 33a Phase B — stub only; Phase D owns webSocketBridge.ts.
 *
 * TODO(Wave 33a Phase D): Replace with real disconnect implementation.
 * Call from webSocketBridge.ts: find all open WS connections whose
 * context.deviceId matches `deviceId` and call ws.close(4002, 'revoked').
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function disconnectDevice(_deviceId: string): void {
  // No-op until Phase D wires the real bridge disconnect.
}
