/**
 * PaneDragHandle.tsx — Wave 28 Phase A
 *
 * A drag handle button placed in pane headers. Visible only when the
 * `layout.dragAndDrop` flag is on. Uses `useDraggable` from @dnd-kit/core
 * with the slot name as the ID so Phase B drop targets can match it.
 *
 * Dropping is not implemented in Phase A — the handle proves useDraggable
 * wiring works and shows the DragOverlay ghost on drag start.
 */

import { useDraggable } from '@dnd-kit/core';
import React from 'react';

import { useDragAndDrop } from './useDragAndDrop';

export interface PaneDragHandleProps {
  /** Slot identifier — passed as the dnd-kit draggable id. */
  slotId: string;
}

/** Six-dot grip icon rendered inside the handle button. */
function GripIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="3" cy="3" r="1.2" />
      <circle cx="9" cy="3" r="1.2" />
      <circle cx="3" cy="6" r="1.2" />
      <circle cx="9" cy="6" r="1.2" />
      <circle cx="3" cy="9" r="1.2" />
      <circle cx="9" cy="9" r="1.2" />
    </svg>
  );
}

export function PaneDragHandle({ slotId }: PaneDragHandleProps): React.ReactElement | null {
  const { enabled } = useDragAndDrop();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: slotId });

  if (!enabled) return null;

  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label="Drag to rearrange pane"
      className={[
        'inline-flex items-center justify-center',
        'w-5 h-5 rounded',
        'bg-surface-raised text-text-semantic-muted',
        'border border-border-semantic',
        'hover:text-text-semantic-primary hover:border-border-accent',
        'focus:outline-none focus:ring-1 focus:ring-border-accent',
        'cursor-grab active:cursor-grabbing',
        'transition-colors duration-100',
        isDragging ? 'opacity-50' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...listeners}
      {...attributes}
    >
      <GripIcon />
    </button>
  );
}
