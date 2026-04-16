/**
 * DroppableSlot.tsx — Wave 28 Phase B + Phase C
 *
 * Wraps a named layout slot region in a dnd-kit drop target.
 * Phase B: shows a 2px accent outline when an active drag hovers the slot center.
 * Phase C: renders four invisible edge zones (N/S/E/W) for split-on-drop.
 *
 * Center area (middle 50%×50%) retains Phase B swap behaviour.
 * Edge zones use composite IDs: `{slotName}:edge:{north|south|east|west}`.
 *
 * Only rendered when the DnD flag is on — callers guard with useDragAndDrop.
 */

import { useDroppable } from '@dnd-kit/core';
import React from 'react';

import { EdgeDropZones } from './EdgeDropZones';
import type { SlotName } from './layoutPresets/types';

export interface DroppableSlotProps {
  slotName: SlotName;
  children: React.ReactNode;
}

/**
 * DroppableSlot — registers the slot as a dnd-kit drop target.
 *
 * The wrapper div uses `position:relative` so the drop indicator outline
 * and edge zones (all absolutely-positioned) stay clipped to the slot region.
 *
 * Phase C adds EdgeDropZones inside the wrapper. The center-area swap target
 * continues to use the plain slotName droppable ID (Phase B).
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
          data-drop-indicator="center"
          className="pointer-events-none absolute inset-0 z-50 rounded-sm border-2 border-border-accent"
        />
      )}
      <EdgeDropZones slotName={slotName} />
    </div>
  );
}
