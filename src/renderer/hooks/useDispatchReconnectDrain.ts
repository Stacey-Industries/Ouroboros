/**
 * useDispatchReconnectDrain.ts — Wave 34 Phase G.
 *
 * Watches for a connection-state transition from 'disconnected'/'connecting'
 * → 'connected'. On that transition, drains the offline dispatch queue by
 * replaying each entry via the sessions.dispatchTask IPC.
 *
 * Idempotency: each queued entry carries a clientRequestId uuid. The desktop
 * handler returns { success: false, error: 'duplicate' } if that id was already
 * processed — the drain interprets this as 'lost' (already done) and removes
 * the entry from the local queue.
 *
 * A toast is shown after drain: "N dispatches sent / N failed / N already processed".
 */

import { useCallback, useEffect, useRef } from 'react';

import {
  drainOfflineDispatches,
  type QueuedOfflineDispatch,
} from '../../web/offlineDispatchQueue';
import { useToast } from './useToast';
import type { ConnectionState } from './useWebConnectionState';

// ── Send helper ───────────────────────────────────────────────────────────────

async function sendEntry(entry: QueuedOfflineDispatch): Promise<boolean> {
  const api = window.electronAPI?.sessions;
  if (!api?.dispatchTask) return false;

  const result = await api.dispatchTask(entry.request, undefined);
  if (result.success) return true;

  if (!result.success && (result as { error: string }).error === 'duplicate') {
    throw new Error('duplicate');
  }
  return false;
}

// ── Toast message builder ─────────────────────────────────────────────────────

function buildDrainMessage(sent: number, failed: number, lost: number): string {
  const parts: string[] = [];
  if (sent > 0) parts.push(`${sent} dispatch${sent === 1 ? '' : 'es'} sent`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (lost > 0) parts.push(`${lost} already processed`);
  return parts.join(' · ') || 'Offline queue drained';
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDispatchReconnectDrain(state: ConnectionState): void {
  const { toast: addToast } = useToast();
  const prevStateRef = useRef<ConnectionState>(state);
  const drainingRef = useRef(false);

  const drain = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      const result = await drainOfflineDispatches(sendEntry);
      const total = result.sent + result.failed + result.lost;
      if (total > 0) {
        addToast(buildDrainMessage(result.sent, result.failed, result.lost), 'info');
      }
    } finally {
      drainingRef.current = false;
    }
  }, [addToast]);

  useEffect(() => {
    const wasOffline =
      prevStateRef.current === 'disconnected' ||
      prevStateRef.current === 'connecting';
    const nowConnected = state === 'connected';
    prevStateRef.current = state;

    if (wasOffline && nowConnected) {
      void drain();
    }
  }, [state, drain]);
}
