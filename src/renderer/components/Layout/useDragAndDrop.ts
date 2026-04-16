/**
 * useDragAndDrop.ts — Wave 28 Phase A
 *
 * Reads the `layout.dragAndDrop` config flag and returns whether DnD is enabled.
 * DragAndDropProvider (exported from this module) wraps the layout tree with
 * DndContext when the flag is on, or renders children as-is when it is off.
 */

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

interface DragAndDropProviderProps {
  children: React.ReactNode;
}

/**
 * DragAndDropProvider — wraps children with DndContext when the flag is on.
 * When disabled, renders children directly with no DndContext overhead.
 */
export function DragAndDropProvider({ children }: DragAndDropProviderProps): React.ReactElement {
  const { enabled } = useDragAndDrop();
  if (!enabled) {
    return React.createElement(React.Fragment, null, children);
  }
  return React.createElement(DndContext, null, children);
}
