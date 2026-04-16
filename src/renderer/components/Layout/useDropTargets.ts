/**
 * useDropTargets.ts — Wave 28 Phase B + Phase C
 *
 * Handles drag-end events and mutates the active preset.
 *
 * Phase B: plain slotName-to-slotName drops call swapSlots.
 * Phase C: `{slotName}:edge:{dir}` drops call splitSlot on the context.
 *
 * No-ops:
 *  - over is null (drop outside any target)
 *  - source === target (drop on itself)
 *  - either ID is not a valid SlotName / edge ID
 *  - unknown over.id format
 */

import type { DragEndEvent } from '@dnd-kit/core';
import { useCallback } from 'react';

import { useLayoutPreset } from './layoutPresets/LayoutPresetResolver';
import { edgeToSplitParams, parseEdgeDropId } from './layoutPresets/splitSlot';
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
 * Must be called inside a LayoutPresetResolverProvider so swapSlots and
 * splitSlot are available.
 */
export function useDropTargets(): UseDropTargetsReturn {
  const { swapSlots, splitSlot } = useLayoutPreset();

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const sourceId = event.active.id;
    const targetId = event.over?.id;

    if (!targetId) return;
    if (sourceId === targetId) return;
    if (!isSlotName(sourceId)) return;

    // Phase C: edge drop — `{slotName}:edge:{direction}`
    if (typeof targetId === 'string') {
      const edgeDrop = parseEdgeDropId(targetId);
      if (edgeDrop) {
        if (edgeDrop.slotName === sourceId) return;
        const { direction, position } = edgeToSplitParams(edgeDrop.edge);
        splitSlot(edgeDrop.slotName, sourceId, direction, position);
        return;
      }
    }

    // Phase B: center drop — plain slot name swap
    if (!isSlotName(targetId)) return;
    swapSlots(sourceId, targetId);
  }, [swapSlots, splitSlot]);

  return { onDragEnd };
}
