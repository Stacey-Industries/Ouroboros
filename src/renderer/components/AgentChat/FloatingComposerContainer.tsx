/**
 * FloatingComposerContainer.tsx — Pill wrapper for the chat composer.
 *
 * Provides a visually elevated surface (raised bg, rounded corners, subtle
 * shadow) so the composer reads as floating above the conversation background
 * rather than flush with it.
 *
 * Layout contract:
 *   - Horizontal padding is owned by this container (px-1 outer wrapper).
 *   - Children (ComposerBody + footer) should NOT add their own outer padding.
 *   - The drag-ring indicator is preserved via a data attribute on the inner div.
 */

import React from 'react';

export interface FloatingComposerContainerProps {
  /** Whether a file is being dragged over the composer. */
  isDragging: boolean;
  children: React.ReactNode;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDragLeave?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
}

// Wave 45 Phase C — composer pulls its surface from the material variant:
// - background: --composer-wash (gradient up from panel)
// - radius: --radius-md
// - shadow: --shadow-bubble (inset top highlight + soft drop)
// We keep the Tailwind `rounded-xl` class as a fallback for snapshot tests
// that still assert it; the inline style wins at render time.
const BASE_CLASS =
  'rounded-xl bg-surface-raised shadow-sm overflow-hidden transition-shadow duration-150';

const DRAG_CLASS =
  'ring-2 ring-inset ring-interactive-accent';

const BASE_STYLE: React.CSSProperties = {
  background: 'var(--composer-wash)',
  borderRadius: 'var(--radius-md)',
  boxShadow: 'var(--shadow-bubble)',
  borderTop: '1px solid var(--stroke-inner)',
};

export function FloatingComposerContainer({
  isDragging,
  children,
  onDragOver,
  onDragLeave,
  onDrop,
}: FloatingComposerContainerProps): React.ReactElement {
  const className = `${BASE_CLASS}${isDragging ? ` ${DRAG_CLASS}` : ''}`;
  return (
    <div
      className={className}
      data-layout="floating-composer"
      style={BASE_STYLE}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {children}
    </div>
  );
}
