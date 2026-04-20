/**
 * EdgeDropZones.tsx — Wave 28 Phase C
 *
 * Renders four invisible hit-regions at the N/S/E/W edges of a slot.
 * Each region is a 25% strip on the corresponding edge; the center 50%×50%
 * area is left open for the Phase B swap drop target.
 *
 * Drop ID format: `{slotName}:edge:{north|south|east|west}`
 * e.g. "editorContent:edge:north"
 *
 * Visual feedback: a 4px accent bar appears on the correct edge when the
 * pointer is hovering that region.
 */

import { useDndContext, useDroppable } from '@dnd-kit/core';
import React from 'react';

import type { EdgeDirection } from './layoutPresets/splitSlot';
import type { SlotName } from './layoutPresets/types';

// ---------------------------------------------------------------------------
// Individual edge zone
// ---------------------------------------------------------------------------

interface EdgeZoneProps {
  slotName: SlotName;
  edge: EdgeDirection;
}

/** Positioning classes for each edge zone (25% strip on the corresponding edge). */
const EDGE_POSITION: Record<EdgeDirection, string> = {
  north: 'top-0 left-0 right-0 h-1/4',
  south: 'bottom-0 left-0 right-0 h-1/4',
  west:  'top-0 left-0 bottom-0 w-1/4',
  east:  'top-0 right-0 bottom-0 w-1/4',
};

/** Accent bar shown on hover — thin bar on the inward face of the edge. */
const HOVER_BAR: Record<EdgeDirection, string> = {
  north: 'bottom-0 left-0 right-0 h-1',
  south: 'top-0 left-0 right-0 h-1',
  west:  'top-0 right-0 bottom-0 w-1',
  east:  'top-0 left-0 bottom-0 w-1',
};

function EdgeZone({ slotName, edge }: EdgeZoneProps): React.ReactElement {
  // Drop ID format: "{slotName}:edge:{direction}"
  const id = `${slotName}:edge:${edge}`;
  const { setNodeRef, isOver } = useDroppable({ id });
  // Only capture pointer events while a drag is active. Without this gate the
  // zones sit on top of the UI at all times (z-40, 25% of each edge) and
  // swallow every click/hover, breaking buttons, dropdowns, hovers, and
  // keyboard focus routing. See DnD debugging notes in the Wave 41 handoff.
  const { active } = useDndContext();
  const pointerEvents = active ? 'pointer-events-auto' : 'pointer-events-none';

  return (
    <div
      ref={setNodeRef}
      data-edge-drop={id}
      aria-hidden="true"
      className={`${pointerEvents} absolute z-40 ${EDGE_POSITION[edge]}`}
    >
      {isOver && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute z-50 bg-interactive-accent opacity-80 ${HOVER_BAR[edge]}`}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EdgeDropZones — renders all 4 edge zones for a slot
// ---------------------------------------------------------------------------

export interface EdgeDropZonesProps {
  slotName: SlotName;
}

const EDGES: EdgeDirection[] = ['north', 'south', 'east', 'west'];

/**
 * EdgeDropZones — render four edge drop-target strips inside a DroppableSlot.
 *
 * Must be placed inside a `position:relative` container; each zone is
 * `position:absolute`. The parent DroppableSlot already sets `relative`.
 */
export function EdgeDropZones({ slotName }: EdgeDropZonesProps): React.ReactElement {
  return (
    <>
      {EDGES.map((edge) => (
        <EdgeZone key={edge} slotName={slotName} edge={edge} />
      ))}
    </>
  );
}
