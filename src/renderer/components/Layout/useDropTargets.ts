/**
 * useDropTargets.ts — Wave 28 Phase B
 *
 * Owns slot-swap logic: given a DragEndEvent from dnd-kit, determines whether
 * the source and target are both valid SlotNames and differ, then calls
 * swapSlots on the active LayoutPreset context.
 *
 * No-ops:
 *  - over is null (drop outside any target)
 *  - source === target (drop on itself)
 *  - either ID is not a valid SlotName
 */

import type { DragEndEvent } from '@dnd-kit/core';
import { useCallback } from 'react';

import { useLayoutPreset } from './layoutPresets/LayoutPresetResolver';
import type { SlotName } from './layoutPresets/types';

/** The exhaustive set of valid slot names. */
const VALID_SLOT_NAMES = new Set<string>([
  'sidebarHeader',
  'sidebarContent',
  'editorTabBar',
  'editorContent',
  'agentCards',
  'terminalContent',
]);

function isSlotName(id: unknown): id is SlotName {
  return typeof id === 'string' && VALID_SLOT_NAMES.has(id);
}

export interface UseDropTargetsReturn {
  /** Wire into DndContext onDragEnd. */
  onDragEnd: (event: DragEndEvent) => void;
}

/**
 * useDropTargets — handles drag-end events and mutates the active preset.
 *
 * Must be called inside a LayoutPresetResolverProvider so swapSlots is
 * available.
 */
export function useDropTargets(): UseDropTargetsReturn {
  const { swapSlots } = useLayoutPreset();

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const sourceId = event.active.id;
    const targetId = event.over?.id;

    if (!targetId) return;
    if (sourceId === targetId) return;
    if (!isSlotName(sourceId) || !isSlotName(targetId)) return;

    swapSlots(sourceId, targetId);
  }, [swapSlots]);

  return { onDragEnd };
}
