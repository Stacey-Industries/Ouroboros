/**
 * useDragAndDrop.ts — Wave 28 Phase A + Phase B + Phase E
 *
 * Reads the `layout.dragAndDrop` config flag and returns whether DnD is enabled.
 * DragAndDropProvider (exported from this module) wraps the layout tree with
 * DndContext when the flag is on, or renders children as-is when it is off.
 *
 * Phase B: DragAndDropProvider now accepts an optional `onDragEnd` handler
 * forwarded to DndContext so useDropTargets can react to completed drags.
 *
 * Phase E:
 * - PointerSensor + TouchSensor (500ms long-press, 5px tolerance) via useLayoutSensors.
 * - DragOverlay renders a lightweight placeholder; component tree stays stable during drag.
 * - activeId state updated in onDragStart, cleared in onDragEnd.
 */

import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import React, { useState } from 'react';

import { useConfig } from '../../hooks/useConfig';

export interface DragAndDropState {
  enabled: boolean;
}

/** Default value used before config loads (flag defaults true in schema). */
const DEFAULT_ENABLED = true;

export function useDragAndDrop(): DragAndDropState {
  const { config } = useConfig();
  const enabled = config?.layout?.dragAndDrop ?? DEFAULT_ENABLED;
  return { enabled };
}

/** Returns configured sensors for the DndContext. Extracted to keep the
 *  provider function under the 40-line ESLint limit. Exported for testing. */
export function useLayoutSensors() {
  return useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 500, tolerance: 5 },
    }),
  );
}

/** Extracts the slot name from a drag id of the form "pane:<slotName>".
 *  Falls back to the raw id when the prefix is absent. */
function slotLabelFromId(id: string | number): string {
  const s = String(id);
  return s.startsWith('pane:') ? s.slice(5) : s;
}

export interface DragAndDropProviderProps {
  children: React.ReactNode;
  /** Called by DndContext on drag end. Wire in useDropTargets.onDragEnd. */
  onDragEnd?: (event: DragEndEvent) => void;
  /** Called by DndContext on drag start. */
  onDragStart?: (event: DragStartEvent) => void;
}

/**
 * DragAndDropProvider — wraps children with DndContext when the flag is on.
 * When disabled, renders children directly with no DndContext overhead.
 */
export function DragAndDropProvider({
  children,
  onDragEnd,
  onDragStart,
}: DragAndDropProviderProps): React.ReactElement {
  const { enabled } = useDragAndDrop();
  const sensors = useLayoutSensors();
  const [activeId, setActiveId] = useState<string | number | null>(null);

  if (!enabled) {
    return React.createElement(React.Fragment, null, children);
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
    onDragStart?.(event);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    onDragEnd?.(event);
  };

  const overlay = activeId !== null
    ? React.createElement(
        'div',
        {
          className: [
            'bg-surface-overlay opacity-70',
            'border border-border-accent rounded',
            'px-3 py-2 text-sm text-text-semantic-muted',
            'pointer-events-none select-none',
          ].join(' '),
        },
        `Moving: ${slotLabelFromId(activeId)}`,
      )
    : null;

  return React.createElement(
    DndContext,
    { sensors, onDragStart: handleDragStart, onDragEnd: handleDragEnd },
    children,
    React.createElement(DragOverlay, null, overlay),
  );
}
