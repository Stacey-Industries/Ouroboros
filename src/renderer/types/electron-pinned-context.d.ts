/**
 * electron-pinned-context.d.ts — IPC type contract for pinned context (Wave 25).
 *
 * PinnedContextItem is re-exported from @shared/types/pinnedContext so both
 * the main process and renderer share a single definition.
 */

export type { PinnedContextItem, PinnedContextType } from '@shared/types/pinnedContext';

import type { PinnedContextItem } from '@shared/types/pinnedContext';

import type { IpcResult } from './electron-foundation';

// ─── Result shapes ────────────────────────────────────────────────────────────

export interface PinnedContextAddResult extends IpcResult {
  item?: PinnedContextItem;
}

export interface PinnedContextListResult extends IpcResult {
  items?: PinnedContextItem[];
}

export interface PinnedContextChangedPayload {
  sessionId: string;
  items: PinnedContextItem[];
}

// ─── API interface ────────────────────────────────────────────────────────────

export interface PinnedContextAPI {
  /** Add a pin to a session. Returns null item when cap is reached. */
  add(
    sessionId: string,
    item: Omit<PinnedContextItem, 'id' | 'addedAt'>,
  ): Promise<PinnedContextAddResult>;

  /** Hard-remove a pin by id. */
  remove(sessionId: string, itemId: string): Promise<IpcResult>;

  /** Soft-hide a pin (sets dismissed: true, keeps it in the array). */
  dismiss(sessionId: string, itemId: string): Promise<IpcResult>;

  /** List pins for a session. Excludes dismissed unless includeDismissed is true. */
  list(
    sessionId: string,
    includeDismissed?: boolean,
  ): Promise<PinnedContextListResult>;

  /**
   * Subscribe to store mutation events. Fires whenever add/remove/dismiss runs.
   * Returns a cleanup function — call it to unsubscribe.
   */
  onChanged(
    callback: (payload: PinnedContextChangedPayload) => void,
  ): () => void;
}
