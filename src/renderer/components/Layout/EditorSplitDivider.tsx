/**
 * EditorSplitDivider — the draggable divider between split editor panes.
 * Extracted from EditorSplitView.tsx to keep that file under 300 lines.
 */

import React, { useCallback, useRef, useState } from 'react';

const SPLIT_DIVIDER_STYLE: React.CSSProperties = {
  width: '5px',
  flexShrink: 0,
  cursor: 'col-resize',
  position: 'relative',
  zIndex: 10,
  userSelect: 'none',
  touchAction: 'none',
};

const SPLIT_DIVIDER_LINE_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: '2px',
  width: '1px',
  transition: 'background-color 150ms ease, opacity 150ms ease',
  opacity: 0,
};

function useSplitDividerDrag(onDrag: (deltaX: number) => void) {
  const startXRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      startXRef.current = e.clientX;
      setIsDragging(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      function handlePointerMove(ev: PointerEvent): void {
        const deltaX = ev.clientX - startXRef.current;
        startXRef.current = ev.clientX;
        onDrag(deltaX);
      }
      function handlePointerUp(): void {
        setIsDragging(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
        document.removeEventListener('pointercancel', handlePointerUp);
      }
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
      document.addEventListener('pointercancel', handlePointerUp);
    },
    [onDrag],
  );

  return { isDragging, handlePointerDown };
}

export function SplitDivider({
  onDrag,
  onReset,
}: {
  onDrag: (deltaX: number) => void;
  onReset: () => void;
}): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const { isDragging, handlePointerDown } = useSplitDividerDrag(onDrag);
  const lineStyle: React.CSSProperties = {
    ...SPLIT_DIVIDER_LINE_STYLE,
    opacity: isHovered || isDragging ? 1 : 0,
    backgroundColor:
      isHovered || isDragging ? 'var(--interactive-accent)' : 'var(--border-semantic)',
  };
  return (
    <div
      style={SPLIT_DIVIDER_STYLE}
      onPointerDown={handlePointerDown}
      onDoubleClick={onReset}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize split panes"
    >
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '-4px', right: '-4px' }} />
      <div style={lineStyle} />
    </div>
  );
}
