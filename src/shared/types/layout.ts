/**
 * layout.ts — Shared layout types for Wave 28 Phase D.
 *
 * SerializedSlotTree is the JSON-safe round-trip form of a SlotNode tree.
 * It mirrors the renderer's SlotNode shape exactly but lives in shared/ so
 * the main-process IPC handler can reference it without importing from @renderer.
 */

export interface SerializedLeafSlot {
  kind: 'leaf';
  slotName: string;
  component: { componentKey: string; [k: string]: unknown };
}

export interface SerializedSplitNode {
  kind: 'split';
  direction: 'horizontal' | 'vertical';
  children: [SerializedSlotTree, SerializedSlotTree];
  ratio?: number;
}

export type SerializedSlotTree = SerializedLeafSlot | SerializedSplitNode;

export interface SerializedGlobalCustomPreset {
  name: string;
  tree: SerializedSlotTree;
  createdAt: number;
}
