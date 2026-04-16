/**
 * useDragAndDrop.ts — Wave 28 Phase A + Phase B
 *
 * Reads the `layout.dragAndDrop` config flag and returns whether DnD is enabled.
 * DragAndDropProvider (exported from this module) wraps the layout tree with
 * DndContext when the flag is on, or renders children as-is when it is off.
 *
 * Phase B: DragAndDropProvider now accepts an optional `onDragEnd` handler
 * forwarded to DndContext so useDropTargets can react to completed drags.
 */

import type { DragEndEvent } from '@dnd-kit/core';
import { DndContext } from '@dnd-kit/core';
import React from 'react';

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

export interface DragAndDropProviderProps {
  children: React.ReactNode;
  /** Called by DndContext on drag end. Wire in useDropTargets.onDragEnd. */
  onDragEnd?: (event: DragEndEvent) => void;
}

/**
 * DragAndDropProvider — wraps children with DndContext when the flag is on.
 * When disabled, renders children directly with no DndContext overhead.
 */
export function DragAndDropProvider({ children, onDragEnd }: DragAndDropProviderProps): React.ReactElement {
  const { enabled } = useDragAndDrop();
  if (!enabled) {
    return React.createElement(React.Fragment, null, children);
  }
  return React.createElement(DndContext, { onDragEnd }, children);
}
