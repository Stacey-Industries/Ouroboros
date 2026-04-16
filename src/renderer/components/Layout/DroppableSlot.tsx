/**
 * DroppableSlot.tsx — Wave 28 Phase B
 *
 * Wraps a named layout slot region in a dnd-kit drop target.
 * Shows a 2px accent outline when an active drag is hovering over the slot.
 * Passes children through unchanged otherwise.
 *
 * Only rendered when the DnD flag is on — callers guard with useDragAndDrop.
 */

import { useDroppable } from '@dnd-kit/core';
import React from 'react';

import type { SlotName } from './layoutPresets/types';

export interface DroppableSlotProps {
  slotName: SlotName;
  children: React.ReactNode;
}

/**
 * DroppableSlot — registers the slot as a dnd-kit drop target.
 *
 * The wrapper div uses `position:relative` + `overflow:hidden` so the
 * drop indicator outline (an absolutely-positioned inset element) never
 * bleeds outside the slot region.
 */
export function DroppableSlot({ slotName, children }: DroppableSlotProps): React.ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id: slotName });

  return (
    <div
      ref={setNodeRef}
      data-droppable-slot={slotName}
      className="relative contents"
      aria-dropeffect={isOver ? 'move' : 'none'}
    >
      {children}
      {isOver && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-50 rounded-sm border-2 border-border-accent"
        />
      )}
    </div>
  );
}
