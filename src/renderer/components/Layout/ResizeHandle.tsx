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

type ResizeDirection = ResizeHandleProps['direction'];

interface HandleLayout {
  ariaOrientation: 'horizontal' | 'vertical';
  containerClassName: string;
  hitAreaClassName: string;
  lineClassName: string;
  gripClassName: string;
}

const GRIP_DOTS = [0, 1, 2, 3, 4];

const HANDLE_LAYOUTS: Record<ResizeDirection, HandleLayout> = {
  vertical: {
    ariaOrientation: 'vertical',
    containerClassName: 'group relative flex-shrink-0 w-[5px] cursor-col-resize select-none z-10',
    hitAreaClassName: 'absolute inset-y-0 -left-1 -right-1',
    lineClassName: `
      absolute inset-y-0 left-[2px] w-[1px]
      bg-border-semantic
      transition-colors duration-100
      group-hover:bg-interactive-accent
      group-active:bg-interactive-accent
    `,
    gripClassName: `
      absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
      flex flex-col gap-[3px]
      opacity-0 group-hover:opacity-60 transition-opacity duration-100
    `,
  },
  horizontal: {
    ariaOrientation: 'horizontal',
    containerClassName: 'group relative flex-shrink-0 h-[5px] cursor-row-resize select-none z-10 w-full',
    hitAreaClassName: 'absolute inset-x-0 -top-1 -bottom-1',
    lineClassName: `
      absolute inset-x-0 top-[2px] h-[1px]
      bg-border-semantic
      transition-colors duration-100
      group-hover:bg-interactive-accent
      group-active:bg-interactive-accent
    `,
    gripClassName: `
      absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
      flex flex-row gap-[3px]
      opacity-0 group-hover:opacity-60 transition-opacity duration-100
    `,
  },
};

function DragGripDots({ direction }: { direction: ResizeDirection }): React.ReactElement<any> {
  return (
    <div className={HANDLE_LAYOUTS[direction].gripClassName}>
      {GRIP_DOTS.map((dot) => (
        <div key={dot} className="w-[3px] h-[3px] rounded-full bg-text-semantic-muted" />
      ))}
    </div>
  );
}

interface ResizeHandleFrameProps {
  direction: ResizeDirection;
  handleRef: React.RefObject<HTMLDivElement | null>;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onDoubleClick: (event: React.MouseEvent<HTMLDivElement>) => void;
}

function ResizeHandleFrame({
  direction,
  handleRef,
  onPointerDown,
  onDoubleClick,
}: ResizeHandleFrameProps): React.ReactElement<any> {
  const layout = HANDLE_LAYOUTS[direction];

  return (
    <div
      ref={handleRef as React.RefObject<HTMLDivElement | null>}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      role="separator"
      aria-orientation={layout.ariaOrientation}
      aria-label="Resize panel"
      className={layout.containerClassName}
      style={{ touchAction: 'none' }}
    >
      <div className={layout.hitAreaClassName} />
      <div className={layout.lineClassName} />
      <DragGripDots direction={direction} />
    </div>
  );
}

export function ResizeHandle({
  direction,
  panel,
  currentSize,
  onResizeStart,
  onDoubleClick,
}: ResizeHandleProps): React.ReactElement<any> {
  const handleRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
      const startPos = direction === 'vertical' ? event.clientX : event.clientY;
      onResizeStart(panel, direction, currentSize, startPos);
    },
    [currentSize, direction, onResizeStart, panel],
  );

  const handleDblClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      onDoubleClick(panel);
    },
    [panel, onDoubleClick],
  );

  return (
    <ResizeHandleFrame
      direction={direction}
      handleRef={handleRef}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDblClick}
    />
  );
}
