/**
 * electron-layout.d.ts — IPC type contract for per-session layout persistence (Wave 28 Phase D).
 *
 * SerializedSlotTree mirrors the renderer's SlotNode but is JSON-safe.
 */

import type { IpcResult } from './electron-foundation';

// ─── Serialized tree (JSON-safe mirror of SlotNode) ───────────────────────────

export interface SerializedLeafSlot {
  kind: 'leaf';
  slotName: string;
  component: { componentKey: string; [k: string]: unknown };
}

export interface SerializedSplitNode {
  kind: 'split';
  direction: 'horizontal' | 'vertical';
  children: [SerializedSlotNode, SerializedSlotNode];
  ratio?: number;
}

export type SerializedSlotNode = SerializedLeafSlot | SerializedSplitNode;

export interface SerializedGlobalCustomPreset {
  name: string;
  tree: SerializedSlotNode;
  createdAt: number;
}

// ─── Result shapes ────────────────────────────────────────────────────────────

export interface CustomLayoutResult extends IpcResult {
  tree?: SerializedSlotNode | null;
}

// ─── API interface ────────────────────────────────────────────────────────────

export interface LayoutAPI {
  /** Load the saved slot tree for a session, or null if none saved. */
  getCustomLayout(sessionId: string): Promise<CustomLayoutResult>;

  /** Persist the current slot tree for a session. No-op if sessionId is empty. */
  setCustomLayout(sessionId: string, tree: SerializedSlotNode): Promise<IpcResult>;

  /** Remove the persisted layout for a session. */
  deleteCustomLayout(sessionId: string): Promise<IpcResult>;

  /**
   * Promote the current layout to a named global preset.
   * Appended to globalCustomPresets; capped at 20 (oldest dropped).
   */
  promoteToGlobal(name: string, tree: SerializedSlotNode): Promise<IpcResult>;
}
