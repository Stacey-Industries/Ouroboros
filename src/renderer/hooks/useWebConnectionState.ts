/**
 * useWebConnectionState.ts — Wave 34 Phase G.
 *
 * Returns the current WebSocket connection state.
 *
 * - In Electron mode (no web-mode class on <html>), returns 'electron' — always
 *   connected; the hook never subscribes to anything.
 * - In web mode, subscribes to window.electronAPI.app.onConnectionState events
 *   emitted by the WebSocketTransport. State transitions:
 *     WS open         → 'connected'
 *     reconnect timer → 'connecting'
 *     WS close        → 'disconnected'
 */

import { useEffect, useState } from 'react';

export type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'electron';

function isWebMode(): boolean {
  return document.documentElement.classList.contains('web-mode');
}

export function useWebConnectionState(): ConnectionState {
  const [state, setState] = useState<ConnectionState>(() =>
    isWebMode() ? 'connecting' : 'electron',
  );

  useEffect(() => {
    if (!isWebMode()) return;
    const api = window.electronAPI?.app;
    if (!api?.onConnectionState) return;
    return api.onConnectionState((s) => {
      setState(s);
    });
  }, []);

  return state;
}
