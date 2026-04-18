/**
 * LayoutPresetResolverProvider.tsx — Provider component for LayoutPresetResolver (Wave 28 Phase D).
 *
 * Split from LayoutPresetResolver.tsx to stay under the 300-line ESLint limit.
 * Adds: per-session persistence, undo stack (depth 10), reset, and promote-to-global.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useViewportBreakpoint } from '../../../hooks/useViewportBreakpoint';
import type { SerializedSlotNode } from '../../../types/electron-layout';
import { useCustomLayoutPersistence } from '../useCustomLayoutPersistence';
import { useLayoutUndoStack } from '../useLayoutUndoStack';
import type {
  LayoutPresetContextValue,
  LayoutPresetResolverProps,
  ProviderState,
} from './LayoutPresetResolver';
import {
  applySwapToTree,
  buildInitialTree,
  buildSwapOverrides,
  LayoutPresetContext,
  useMobilePrimaryFlag,
  usePresetsFlag,
  useResolvedPreset,
  useSplitSlotCallback,
} from './LayoutPresetResolver';
import type { SlotNode } from './slotTree';
import { isSplit } from './slotTree';
import type { LayoutPreset } from './types';

// ---------------------------------------------------------------------------
// Wave 32 Phase B — mobile-primary override helper
// ---------------------------------------------------------------------------

/**
 * When mobilePrimaryOn is true and the viewport is at phone width, returns
 * 'mobile-primary' as the effective force preset ID — this bypasses the
 * layout.presets.v2 flag and the session preset, matching the plan spec.
 * An explicit forcePresetId from the caller takes precedence.
 */
function resolveMobileForcePreset(
  mobilePrimaryOn: boolean,
  breakpoint: import('../../../hooks/useViewportBreakpoint').ViewportBreakpoint,
  callerForcePresetId: string | undefined,
): string | undefined {
  if (callerForcePresetId) return callerForcePresetId;
  if (mobilePrimaryOn && breakpoint === 'phone') return 'mobile-primary';
  return undefined;
}

// ---------------------------------------------------------------------------
// Phase D aux hook — undo, reset, promote-to-global
// ---------------------------------------------------------------------------

interface PhaseDParams {
  basePreset: LayoutPreset;
  slotTree: SlotNode;
  setSlotTree: React.Dispatch<React.SetStateAction<SlotNode>>;
  persistence: ReturnType<typeof useCustomLayoutPersistence>;
  undoStack: ReturnType<typeof useLayoutUndoStack>;
}

function usePhaseDAux({
  basePreset,
  slotTree,
  setSlotTree,
  persistence,
  undoStack,
}: PhaseDParams): Pick<LayoutPresetContextValue, 'undoLayout' | 'canUndo' | 'resetLayout' | 'promoteToGlobal'> {
  const undoLayout = useCallback(() => {
    const prev = undoStack.pop();
    if (prev === null) return;
    setSlotTree(prev as SlotNode);
    persistence.save(prev as SerializedSlotNode);
  }, [undoStack, setSlotTree, persistence]);

  const resetLayout = useCallback(() => {
    const fresh = buildInitialTree(basePreset.slots);
    setSlotTree(fresh);
    persistence.clear();
  }, [basePreset.slots, setSlotTree, persistence]);

  const promoteToGlobal = useCallback((name: string) => {
    if (!name || typeof window === 'undefined' || !('electronAPI' in window)) return;
    void window.electronAPI.layout.promoteToGlobal(name, slotTree as SerializedSlotNode);
  }, [slotTree]);

  return { undoLayout, canUndo: undoStack.canUndo, resetLayout, promoteToGlobal };
}

// ---------------------------------------------------------------------------
// Provider — state hook (extracted to stay under 40-line function limit)
// ---------------------------------------------------------------------------

const DEFAULT_LEAF: SlotNode = {
  kind: 'leaf',
  slotName: 'editorContent',
  component: { componentKey: 'editorContent' },
};

interface ProviderCore {
  basePreset: LayoutPreset;
  preset: LayoutPreset;
  setSlotOverrides: React.Dispatch<React.SetStateAction<Partial<Record<import('./types').SlotName, import('./types').ComponentDescriptor>>>>;
  slotTree: SlotNode;
  setSlotTree: React.Dispatch<React.SetStateAction<SlotNode>>;
  persistence: ReturnType<typeof useCustomLayoutPersistence>;
  undoStack: ReturnType<typeof useLayoutUndoStack>;
}

function useProviderCore(
  sessionPresetId: string | undefined,
  forcePresetId: string | undefined,
  sessionId: string,
): ProviderCore {
  const flagOn = usePresetsFlag();
  const mobilePrimaryOn = useMobilePrimaryFlag();
  const breakpoint = useViewportBreakpoint();
  const effectiveForcePresetId = resolveMobileForcePreset(mobilePrimaryOn, breakpoint, forcePresetId);
  const [basePreset, preset, setSlotOverrides] = useResolvedPreset(flagOn, sessionPresetId, effectiveForcePresetId);
  const [slotTree, setSlotTree] = useState<SlotNode>(DEFAULT_LEAF);
  const persistence = useCustomLayoutPersistence(sessionId);
  const undoStack = useLayoutUndoStack();
  useEffect(() => {
    if (persistence.savedTree) {
      setSlotTree(persistence.savedTree as SlotNode);
    } else {
      setSlotTree((prev) => (isSplit(prev) ? prev : buildInitialTree(basePreset.slots)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePreset]);
  return { basePreset, preset, setSlotOverrides, slotTree, setSlotTree, persistence, undoStack };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function LayoutPresetResolverProvider({
  sessionPresetId,
  forcePresetId,
  sessionId = '',
  children,
}: LayoutPresetResolverProps): React.ReactElement {
  const { basePreset, preset, setSlotOverrides, slotTree, setSlotTree, persistence, undoStack } =
    useProviderCore(sessionPresetId, forcePresetId, sessionId);

  const state: ProviderState = { preset, slotTree, setSlotOverrides, setSlotTree };

  const swapSlots = useCallback((a: import('./types').SlotName, b: import('./types').SlotName) => {
    undoStack.push(slotTree as SerializedSlotNode);
    setSlotOverrides((prev) => buildSwapOverrides(preset.slots, prev, a, b));
    setSlotTree((prev) => {
      const next = applySwapToTree(prev, a, b, preset.slots);
      persistence.save(next as SerializedSlotNode);
      return next;
    });
  }, [preset.slots, setSlotOverrides, slotTree, undoStack, persistence]);

  const splitSlot = useSplitSlotCallback(state);
  const aux = usePhaseDAux({ basePreset, slotTree, setSlotTree, persistence, undoStack });

  const value = useMemo<LayoutPresetContextValue>(
    () => ({ preset, slotTree, swapSlots, splitSlot, ...aux }),
    [preset, slotTree, swapSlots, splitSlot, aux],
  );

  return (
    <LayoutPresetContext.Provider value={value}>
      {children}
    </LayoutPresetContext.Provider>
  );
}
