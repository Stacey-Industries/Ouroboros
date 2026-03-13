import React, { useRef, useEffect, useCallback, useState, memo } from 'react';

export interface MinimapProps {
  /** Raw file content (plain text lines) */
  lines: string[];
  /** The scrollable container for the main code area */
  scrollContainer: HTMLDivElement | null;
  /** Whether the minimap is visible */
  visible: boolean;
}

const MINIMAP_WIDTH = 70;
const LINE_HEIGHT = 2;
const LINE_GAP = 1;
const MINIMAP_LINE_TOTAL = LINE_HEIGHT + LINE_GAP;
const MAX_LINE_CHARS = 120;

/**
 * Minimap â€” a canvas-based code overview panel rendered on the right side
 * of the file viewer. Shows colored bars approximating line lengths and
 * a viewport indicator that can be clicked/dragged to scroll.
 */
export const Minimap = memo(function Minimap({
  lines,
  scrollContainer,
  visible,
}: MinimapProps): React.ReactElement | null {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const totalMinimapHeight = lines.length * MINIMAP_LINE_TOTAL;

  useMinimapCanvas(canvasRef, lines, totalMinimapHeight, visible);
  const viewportRect = useMinimapViewport(scrollContainer, totalMinimapHeight, visible);
  const handleMouseDown = useMinimapDrag(containerRef, scrollContainer, totalMinimapHeight);

  if (!visible) return null;

  return (
    <MinimapPanel
      containerRef={containerRef}
      canvasRef={canvasRef}
      viewportRect={viewportRect}
      onMouseDown={handleMouseDown}
    />
  );
});

function useMinimapCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  lines: string[],
  totalMinimapHeight: number,
  visible: boolean
): void {
  const drawCanvas = useCallback(() => {
    drawMinimapCanvas(canvasRef.current, lines, totalMinimapHeight);
  }, [canvasRef, lines, totalMinimapHeight]);

  useEffect(() => {
    if (visible) drawCanvas();
  }, [visible, drawCanvas]);

  useEffect(() => {
    if (!visible) return;
    window.addEventListener('resize', drawCanvas);
    return () => window.removeEventListener('resize', drawCanvas);
  }, [visible, drawCanvas]);
}

function useMinimapViewport(
  scrollContainer: HTMLDivElement | null,
  totalMinimapHeight: number,
  visible: boolean
): { top: number; height: number } {
  const [viewportRect, setViewportRect] = useState({ top: 0, height: 0 });
  const updateViewport = useCallback(() => {
    setViewportRect(getViewportRect(scrollContainer, totalMinimapHeight));
  }, [scrollContainer, totalMinimapHeight]);

  useEffect(() => {
    if (!scrollContainer || !visible) return;
    updateViewport();
    const handleScroll = () => updateViewport();
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [scrollContainer, visible, updateViewport]);

  useEffect(() => {
    if (!visible) return;
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, [visible, updateViewport]);

  return viewportRect;
}

function useMinimapDrag(
  containerRef: React.RefObject<HTMLDivElement | null>,
  scrollContainer: HTMLDivElement | null,
  totalMinimapHeight: number
): (event: React.MouseEvent) => void {
  const isDraggingRef = useRef(false);

  return useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      isDraggingRef.current = true;
      scrollToMinimapPointer(containerRef.current, scrollContainer, totalMinimapHeight, event.clientY);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDraggingRef.current) return;
        scrollToMinimapPointer(containerRef.current, scrollContainer, totalMinimapHeight, moveEvent.clientY);
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [containerRef, scrollContainer, totalMinimapHeight]
  );
}

interface MinimapPanelProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  viewportRect: { top: number; height: number };
  onMouseDown: (event: React.MouseEvent) => void;
}

function MinimapPanel({
  containerRef,
  canvasRef,
  viewportRect,
  onMouseDown,
}: MinimapPanelProps): React.ReactElement {
  return (
    <div ref={containerRef} onMouseDown={onMouseDown} style={minimapContainerStyle}>
      <canvas ref={canvasRef} />
      <div style={getViewportIndicatorStyle(viewportRect)} />
    </div>
  );
}

function drawMinimapCanvas(
  canvas: HTMLCanvasElement | null,
  lines: string[],
  totalMinimapHeight: number
): void {
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = MINIMAP_WIDTH * dpr;
  canvas.height = totalMinimapHeight * dpr;
  canvas.style.width = `${MINIMAP_WIDTH}px`;
  canvas.style.height = `${totalMinimapHeight}px`;
  context.scale(dpr, dpr);
  context.clearRect(0, 0, MINIMAP_WIDTH, totalMinimapHeight);
  drawMinimapLines(context, lines);
}

function drawMinimapLines(
  context: CanvasRenderingContext2D,
  lines: string[]
): void {
  const charWidth = (MINIMAP_WIDTH - 4) / MAX_LINE_CHARS;
  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#888';

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].replace(/^\s+/, '');
    if (trimmed.length === 0) continue;

    const indent = lines[index].length - trimmed.length;
    context.fillStyle = textColor;
    context.globalAlpha = 0.4;
    context.fillRect(
      2 + indent * charWidth,
      index * MINIMAP_LINE_TOTAL,
      Math.max(Math.min(trimmed.length, MAX_LINE_CHARS - indent) * charWidth, 2),
      LINE_HEIGHT
    );
  }

  context.globalAlpha = 1;
}

function getViewportRect(
  scrollContainer: HTMLDivElement | null,
  totalMinimapHeight: number
): { top: number; height: number } {
  if (!scrollContainer || scrollContainer.scrollHeight === 0) {
    return { top: 0, height: 0 };
  }

  const ratio = totalMinimapHeight / scrollContainer.scrollHeight;
  return {
    top: scrollContainer.scrollTop * ratio,
    height: Math.max(scrollContainer.clientHeight * ratio, 10),
  };
}

function scrollToMinimapPointer(
  container: HTMLDivElement | null,
  scrollContainer: HTMLDivElement | null,
  totalMinimapHeight: number,
  clientY: number
): void {
  if (!container || !scrollContainer) return;

  const rect = container.getBoundingClientRect();
  const y = clientY - rect.top + container.scrollTop;
  const ratio = y / totalMinimapHeight;
  const targetScroll = ratio * scrollContainer.scrollHeight - scrollContainer.clientHeight / 2;

  scrollContainer.scrollTop = Math.max(
    0,
    Math.min(targetScroll, scrollContainer.scrollHeight - scrollContainer.clientHeight)
  );
}

const minimapContainerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  width: `${MINIMAP_WIDTH}px`,
  height: '100%',
  overflow: 'hidden',
  cursor: 'pointer',
  zIndex: 3,
  backgroundColor: 'var(--bg)',
  borderLeft: '1px solid var(--border-muted)',
  opacity: 0.85,
};

function getViewportIndicatorStyle(viewportRect: {
  top: number;
  height: number;
}): React.CSSProperties {
  return {
    position: 'absolute',
    top: `${viewportRect.top}px`,
    left: 0,
    right: 0,
    height: `${viewportRect.height}px`,
    backgroundColor: 'var(--accent)',
    opacity: 0.15,
    borderTop: '1px solid var(--accent)',
    borderBottom: '1px solid var(--accent)',
    pointerEvents: 'none',
  };
}
