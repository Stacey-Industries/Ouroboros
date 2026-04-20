/**
 * LayoutPresetResolver — React context for layout presets (Wave 17 + Wave 28 Phase B/C/D).
 *
 * This file owns: context definition, types, helpers, internal hooks, and useLayoutPreset().
 * The provider component lives in LayoutPresetResolverProvider.tsx (split for line-count).
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
  /** Wave 28 Phase D — undo the last layout mutation. No-op if stack is empty. */
  undoLayout: () => void;
  /** Wave 28 Phase D — true when there is at least one undo entry. */
  canUndo: boolean;
  /** Wave 28 Phase D — reset slotTree to preset default and clear persistence. */
  resetLayout: () => void;
  /** Wave 28 Phase D — promote current slotTree to a named global preset. */
  promoteToGlobal: (name: string) => void;
}

export interface LayoutPresetResolverProps {
  /** The layoutPresetId from the active Session record. Falls back to ide-primary. */
  sessionPresetId?: string;
  /** Forces a specific preset id, bypassing the feature-flag check. */
  forcePresetId?: string;
  /** Wave 28 Phase D — session ID for per-session layout persistence. */
  sessionId?: string;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Context + default value
// ---------------------------------------------------------------------------

const DEFAULT_LEAF: LeafSlot = {
  kind: 'leaf',
  slotName: 'editorContent',
  component: { componentKey: 'editorContent' },
};

export const LayoutPresetContext = createContext<LayoutPresetContextValue>({
  preset: idePrimaryPreset,
  slotTree: DEFAULT_LEAF,
  swapSlots: () => undefined,
  splitSlot: () => undefined,
  undoLayout: () => undefined,
  canUndo: false,
  resetLayout: () => undefined,
  promoteToGlobal: () => undefined,
});

// ---------------------------------------------------------------------------
// Helpers — exported so LayoutPresetResolverProvider.tsx can import them
// ---------------------------------------------------------------------------

export function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

export async function readPresetsFlag(): Promise<boolean> {
  if (!hasElectronAPI()) return false;
  try {
    const cfg = await window.electronAPI.config.getAll();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cfg as any)?.layout?.presets?.v2 === true;
  } catch {
    return false;
  }
}

export async function readMobilePrimaryFlag(): Promise<boolean> {
  if (!hasElectronAPI()) return false;
  try {
    const cfg = await window.electronAPI.config.getAll();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cfg as any)?.layout?.mobilePrimary === true;
  } catch {
    return false;
  }
}

export function resolveBasePreset(
  flagOn: boolean,
  sessionPresetId?: string,
  forcePresetId?: string,
): LayoutPreset {
  if (forcePresetId) return resolveBuiltInPreset(forcePresetId);
  if (!flagOn) return idePrimaryPreset;
  return resolveBuiltInPreset(sessionPresetId);
}

export function applyOverrides(
  base: LayoutPreset,
  overrides: Partial<Record<SlotName, ComponentDescriptor>>,
): LayoutPreset {
  if (Object.keys(overrides).length === 0) return base;
  return { ...base, slots: { ...base.slots, ...overrides } };
}

export function buildSwapOverrides(
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

export function buildInitialTree(
  slots: Partial<Record<SlotName, ComponentDescriptor>>,
): SlotNode {
  const SLOT_ORDER: SlotName[] = [
    'sidebarHeader', 'sidebarContent', 'editorTabBar',
    'editorContent', 'agentCards', 'terminalContent',
  ];
  const firstSlot = SLOT_ORDER.find((s) => slots[s] !== undefined) ?? 'editorContent';
  const descriptor = slots[firstSlot] ?? { componentKey: firstSlot };
  return { kind: 'leaf', slotName: firstSlot, component: descriptor };
}

export function applySwapToTree(
  tree: SlotNode,
  a: SlotName,
  b: SlotName,
  slots: Partial<Record<SlotName, ComponentDescriptor>>,
): SlotNode {
  function swapInNode(node: SlotNode): SlotNode {
    if (isLeaf(node)) {
      if (node.slotName === a) return { ...node, component: slots[b] ?? { componentKey: b } };
      if (node.slotName === b) return { ...node, component: slots[a] ?? { componentKey: a } };
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
// Internal hooks — exported for provider use
// ---------------------------------------------------------------------------

export interface ProviderState {
  preset: LayoutPreset;
  slotTree: SlotNode;
  setSlotOverrides: React.Dispatch<React.SetStateAction<Partial<Record<SlotName, ComponentDescriptor>>>>;
  setSlotTree: React.Dispatch<React.SetStateAction<SlotNode>>;
  persistence: { save: (tree: unknown) => void };
}

export function usePresetsFlag(): boolean {
  const [flagOn, setFlagOn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void readPresetsFlag().then((v) => { if (!cancelled) setFlagOn(v); });
    return () => { cancelled = true; };
  }, []);
  return flagOn;
}

export function useMobilePrimaryFlag(): boolean {
  const [flagOn, setFlagOn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void readMobilePrimaryFlag().then((v) => { if (!cancelled) setFlagOn(v); });
    return () => { cancelled = true; };
  }, []);
  return flagOn;
}

export function useResolvedPreset(
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

export function useSplitSlotCallback(
  state: ProviderState,
): (targetSlot: SlotName, sourceSlot: SlotName, direction: 'horizontal' | 'vertical', position: 'start' | 'end') => void {
  return useCallback((targetSlot, sourceSlot, direction, position) => {
    state.setSlotTree((prev) => {
      const sourceDesc = state.preset.slots[sourceSlot] ?? { componentKey: sourceSlot };
      const sourceLeaf: LeafSlot = { kind: 'leaf', slotName: sourceSlot, component: sourceDesc };
      const next = unsplitIfOrphan(splitLeafWith({ tree: prev, targetSlot, source: sourceLeaf, direction, position }));
      // Wave 41 CRIT-A fix: persist split so layout survives reload (was missing).
      state.persistence.save(next);
      return next;
    });
  }, [state]);
}

// ---------------------------------------------------------------------------
// Provider — in LayoutPresetResolverProvider.tsx (split for ESLint line limit)
// ---------------------------------------------------------------------------

export { LayoutPresetResolverProvider } from './LayoutPresetResolverProvider';

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export function useLayoutPreset(): LayoutPresetContextValue {
  return useContext(LayoutPresetContext);
}
