/**
 * LayoutPresetResolver — React context provider (Wave 17 + Wave 28 Phase B + Phase C)
 *
 * Reads the active session's layoutPresetId (or falls back to ide-primary)
 * and exposes the resolved LayoutPreset via useLayoutPreset().
 *
 * Wave 28 Phase B adds:
 *  - `swapSlots(a, b)` mutation exposed on the context value
 *  - In-memory slot overrides layered on top of the resolved base preset
 *
 * Wave 28 Phase C adds:
 *  - `slotTree: SlotNode` — binary tree derived from the current slot map
 *  - `splitSlot(targetSlot, sourceSlot, direction, position)` — splits a leaf
 *
 * When the feature flag layout.presets.v2 is off (default), always returns
 * idePrimaryPreset regardless of session state, but swapSlots/splitSlot still
 * work on the in-memory override layer.
 *
 * Backwards-compatible: if no splits exist, slotTree serialises to the same
 * 6 leaves and existing swapSlots behaviour is unchanged.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { LeafSlot, SlotNode } from '../layoutPresets/slotTree';
import { isLeaf, isSplit } from '../layoutPresets/slotTree';
import { splitLeafWith, unsplitIfOrphan } from '../layoutPresets/splitSlot';
import { idePrimaryPreset, resolveBuiltInPreset } from './presets';
import type { ComponentDescriptor, LayoutPreset, SlotName } from './types';

// ---------------------------------------------------------------------------
// Context value shape
// ---------------------------------------------------------------------------

export interface LayoutPresetContextValue {
  preset: LayoutPreset;
  /** Binary tree representing the current split layout. */
  slotTree: SlotNode;
  /** Swap the ComponentDescriptors of two slots in the active preset (in-memory). */
  swapSlots: (a: SlotName, b: SlotName) => void;
  /**
   * Split the leaf at targetSlot, inserting sourceSlot as a neighbour.
   * direction: 'horizontal' (top/bottom) | 'vertical' (left/right)
   * position: 'start' (source first) | 'end' (source after target)
   */
  splitSlot: (
    targetSlot: SlotName,
    sourceSlot: SlotName,
    direction: 'horizontal' | 'vertical',
    position: 'start' | 'end',
  ) => void;
}

const DEFAULT_LEAF: LeafSlot = {
  kind: 'leaf',
  slotName: 'editorContent',
  component: { componentKey: 'editorContent' },
};

const LayoutPresetContext = createContext<LayoutPresetContextValue>({
  preset: idePrimaryPreset,
  slotTree: DEFAULT_LEAF,
  swapSlots: () => undefined,
  splitSlot: () => undefined,
});

// ---------------------------------------------------------------------------
// Provider props
// ---------------------------------------------------------------------------

export interface LayoutPresetResolverProps {
  /**
   * The layoutPresetId from the active Session record.
   * Pass undefined when no session is active — falls back to ide-primary.
   * Wave 20 will wire this from the session store.
   */
  sessionPresetId?: string;
  /**
   * Forces a specific preset id, bypassing the feature-flag check.
   * Used by dedicated chat windows (Wave 20 Phase B) where `?mode=chat`
   * must render the `chat-primary` preset regardless of `layout.presets.v2`.
   */
  forcePresetId?: string;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Feature-flag reader
// ---------------------------------------------------------------------------

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

async function readPresetsFlag(): Promise<boolean> {
  if (!hasElectronAPI()) return false;
  try {
    const cfg = await window.electronAPI.config.getAll();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cfg as any)?.layout?.presets?.v2 === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveBasePreset(
  flagOn: boolean,
  sessionPresetId?: string,
  forcePresetId?: string,
): LayoutPreset {
  if (forcePresetId) return resolveBuiltInPreset(forcePresetId);
  if (!flagOn) return idePrimaryPreset;
  return resolveBuiltInPreset(sessionPresetId);
}

function applyOverrides(
  base: LayoutPreset,
  overrides: Partial<Record<SlotName, ComponentDescriptor>>,
): LayoutPreset {
  if (Object.keys(overrides).length === 0) return base;
  return { ...base, slots: { ...base.slots, ...overrides } };
}

function buildSwapOverrides(
  currentSlots: Partial<Record<SlotName, ComponentDescriptor>>,
  prev: Partial<Record<SlotName, ComponentDescriptor>>,
  a: SlotName,
  b: SlotName,
): Partial<Record<SlotName, ComponentDescriptor>> {
  const merged = { ...currentSlots, ...prev };
  const aDesc = merged[a];
  const bDesc = merged[b];
  const next = { ...prev };
  if (bDesc !== undefined) { next[a] = bDesc; } else { delete next[a]; }
  if (aDesc !== undefined) { next[b] = aDesc; } else { delete next[b]; }
  return next;
}

/**
 * Build the initial slot tree from the preset's slot map.
 * Each named slot becomes a leaf; no splits exist in the initial state.
 * This guarantees backwards-compatibility: a fresh tree with 6 leaves
 * renders identically to the pre-Phase-C layout.
 */
function buildInitialTree(
  slots: Partial<Record<SlotName, ComponentDescriptor>>,
): SlotNode {
  const SLOT_ORDER: SlotName[] = [
    'sidebarHeader',
    'sidebarContent',
    'editorTabBar',
    'editorContent',
    'agentCards',
    'terminalContent',
  ];

  // Return the first populated leaf we can find, or a sensible default.
  // The tree is used for split rendering — a flat list of leaves is equivalent
  // to the legacy 6-slot layout when no splits are present.
  const firstSlot = SLOT_ORDER.find((s) => slots[s] !== undefined) ?? 'editorContent';
  const descriptor = slots[firstSlot] ?? { componentKey: firstSlot };
  return { kind: 'leaf', slotName: firstSlot, component: descriptor };
}

/**
 * Replace the leaf matching sourceSlot in the tree with the descriptor from
 * the preset slots, then return the updated tree.
 */
function applySwapToTree(
  tree: SlotNode,
  a: SlotName,
  b: SlotName,
  slots: Partial<Record<SlotName, ComponentDescriptor>>,
): SlotNode {
  // Walk the tree swapping component descriptors for the two affected leaves.
  function swapInNode(node: SlotNode): SlotNode {
    if (isLeaf(node)) {
      if (node.slotName === a) {
        const desc = slots[b] ?? { componentKey: b };
        return { ...node, component: desc };
      }
      if (node.slotName === b) {
        const desc = slots[a] ?? { componentKey: a };
        return { ...node, component: desc };
      }
      return node;
    }
    if (!isSplit(node)) return node;
    const left = swapInNode(node.children[0]);
    const right = swapInNode(node.children[1]);
    if (left === node.children[0] && right === node.children[1]) return node;
    return { ...node, children: [left, right] };
  }
  return swapInNode(tree);
}

// ---------------------------------------------------------------------------
// Provider — internal hooks extracted to stay under 40-line limit
// ---------------------------------------------------------------------------

interface ProviderState {
  preset: LayoutPreset;
  slotTree: SlotNode;
  setSlotOverrides: React.Dispatch<React.SetStateAction<Partial<Record<SlotName, ComponentDescriptor>>>>;
  setSlotTree: React.Dispatch<React.SetStateAction<SlotNode>>;
}

function usePresetsFlag(): boolean {
  const [flagOn, setFlagOn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void readPresetsFlag().then((v) => { if (!cancelled) setFlagOn(v); });
    return () => { cancelled = true; };
  }, []);
  return flagOn;
}

function useResolvedPreset(
  flagOn: boolean,
  sessionPresetId: string | undefined,
  forcePresetId: string | undefined,
): [LayoutPreset, LayoutPreset, React.Dispatch<React.SetStateAction<Partial<Record<SlotName, ComponentDescriptor>>>>] {
  const [slotOverrides, setSlotOverrides] = useState<Partial<Record<SlotName, ComponentDescriptor>>>({});
  const basePreset = useMemo(
    () => resolveBasePreset(flagOn, sessionPresetId, forcePresetId),
    [flagOn, forcePresetId, sessionPresetId],
  );
  const preset = useMemo(() => applyOverrides(basePreset, slotOverrides), [basePreset, slotOverrides]);
  return [basePreset, preset, setSlotOverrides];
}

function useSplitSlotCallback(
  state: ProviderState,
): (targetSlot: SlotName, sourceSlot: SlotName, direction: 'horizontal' | 'vertical', position: 'start' | 'end') => void {
  return useCallback((targetSlot, sourceSlot, direction, position) => {
    state.setSlotTree((prev) => {
      const sourceDesc = state.preset.slots[sourceSlot] ?? { componentKey: sourceSlot };
      const sourceLeaf: LeafSlot = { kind: 'leaf', slotName: sourceSlot, component: sourceDesc };
      return unsplitIfOrphan(splitLeafWith({ tree: prev, targetSlot, source: sourceLeaf, direction, position }));
    });
  }, [state]);
}

export function LayoutPresetResolverProvider({
  sessionPresetId,
  forcePresetId,
  children,
}: LayoutPresetResolverProps): React.ReactElement {
  const flagOn = usePresetsFlag();
  const [basePreset, preset, setSlotOverrides] = useResolvedPreset(flagOn, sessionPresetId, forcePresetId);
  const [slotTree, setSlotTree] = useState<SlotNode>(DEFAULT_LEAF);

  // Re-init tree when base preset changes; preserve existing splits.
  useEffect(() => {
    setSlotTree((prev) => (isSplit(prev) ? prev : buildInitialTree(basePreset.slots)));
  }, [basePreset]);

  const state: ProviderState = { preset, slotTree, setSlotOverrides, setSlotTree };

  const swapSlots = useCallback((a: SlotName, b: SlotName) => {
    setSlotOverrides((prev) => buildSwapOverrides(preset.slots, prev, a, b));
    setSlotTree((prev) => applySwapToTree(prev, a, b, preset.slots));
  }, [preset.slots, setSlotOverrides]);

  const splitSlot = useSplitSlotCallback(state);

  const value = useMemo<LayoutPresetContextValue>(
    () => ({ preset, slotTree, swapSlots, splitSlot }),
    [preset, slotTree, swapSlots, splitSlot],
  );

  return (
    <LayoutPresetContext.Provider value={value}>
      {children}
    </LayoutPresetContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

/**
 * Returns the resolved LayoutPreset and mutations for the current session.
 *
 * When layout.presets.v2 is off (default), always returns idePrimaryPreset.
 * Must be called inside a LayoutPresetResolverProvider.
 *
 * Wave 28 Phase B: destructure `{ preset, swapSlots }`.
 * Wave 28 Phase C: also available: `{ slotTree, splitSlot }`.
 */
export function useLayoutPreset(): LayoutPresetContextValue {
  return useContext(LayoutPresetContext);
}
