/**
 * ResizeDivider.tsx — Thin resize divider with hover/active accent highlight.
 * Used between panels in AppLayout.
 */

import React from 'react';

export interface ResizeDividerProps {
  direction: 'horizontal' | 'vertical';
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: () => void;
  label: string;
}

export function ResizeDivider({ direction, onPointerDown, onDoubleClick, label }: ResizeDividerProps): React.ReactElement<any> {
  const isVertical = direction === 'vertical';
  return (
    <div
      data-layout="resize-handle"
      className={`group relative flex-shrink-0 ${isVertical ? 'w-[5px] cursor-col-resize' : 'h-[5px] cursor-row-resize w-full'} select-none z-10`}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      role="separator"
      aria-orientation={direction}
      aria-label={label}
      style={{ touchAction: 'none' }}
    >
      <div className={`absolute ${isVertical ? 'inset-y-0 -left-1 -right-1' : 'inset-x-0 -top-1 -bottom-1'}`} />
      <div
        data-layout="resize-handle-line"
        className={`absolute ${isVertical ? 'inset-y-0 left-[2px] w-[1px]' : 'inset-x-0 top-[2px] h-[1px]'} bg-border-semantic opacity-0 transition-all duration-150 group-hover:opacity-100 group-hover:bg-interactive-accent group-active:opacity-100 group-active:bg-interactive-accent`}
      />
    </div>
  );
}
