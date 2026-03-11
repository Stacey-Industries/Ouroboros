import React, { useCallback, useRef } from 'react';
import type { PanelId } from './useResizable';

export interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  panel: PanelId;
  currentSize: number;
  onResizeStart: (panel: PanelId, direction: 'horizontal' | 'vertical', startValue: number, startPos: number) => void;
  onDoubleClick: (panel: PanelId) => void;
  minSize?: number;
  maxSize?: number;
}

export function ResizeHandle({
  direction,
  panel,
  currentSize,
  onResizeStart,
  onDoubleClick,
}: ResizeHandleProps): React.ReactElement {
  const isVertical = direction === 'vertical';
  const handleRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startPos = isVertical ? e.clientX : e.clientY;
      onResizeStart(panel, direction, currentSize, startPos);
    },
    [isVertical, panel, direction, currentSize, onResizeStart],
  );

  const handleDblClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onDoubleClick(panel);
    },
    [panel, onDoubleClick],
  );

  if (isVertical) {
    return (
      <div
        ref={handleRef}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDblClick}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        className="group relative flex-shrink-0 w-[5px] cursor-col-resize select-none z-10"
        style={{ touchAction: 'none' }}
      >
        {/* Hit area */}
        <div className="absolute inset-y-0 -left-1 -right-1" />
        {/* Visual line */}
        <div
          className="
            absolute inset-y-0 left-[2px] w-[1px]
            bg-[var(--border)]
            transition-colors duration-100
            group-hover:bg-[var(--accent)]
            group-active:bg-[var(--accent)]
          "
        />
        {/* Drag grip dots */}
        <div
          className="
            absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
            flex flex-col gap-[3px]
            opacity-0 group-hover:opacity-60 transition-opacity duration-100
          "
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-[3px] h-[3px] rounded-full bg-[var(--text-muted)]"
            />
          ))}
        </div>
      </div>
    );
  }

  // Horizontal (between content area and terminal)
  return (
    <div
      ref={handleRef}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDblClick}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize panel"
      className="group relative flex-shrink-0 h-[5px] cursor-row-resize select-none z-10 w-full"
      style={{ touchAction: 'none' }}
    >
      {/* Hit area */}
      <div className="absolute inset-x-0 -top-1 -bottom-1" />
      {/* Visual line */}
      <div
        className="
          absolute inset-x-0 top-[2px] h-[1px]
          bg-[var(--border)]
          transition-colors duration-100
          group-hover:bg-[var(--accent)]
          group-active:bg-[var(--accent)]
        "
      />
      {/* Drag grip dots */}
      <div
        className="
          absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
          flex flex-row gap-[3px]
          opacity-0 group-hover:opacity-60 transition-opacity duration-100
        "
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="w-[3px] h-[3px] rounded-full bg-[var(--text-muted)]"
          />
        ))}
      </div>
    </div>
  );
}
