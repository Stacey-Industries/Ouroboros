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
const LINE_HEIGHT = 2; // pixels per line in minimap
const LINE_GAP = 1;
const MINIMAP_LINE_TOTAL = LINE_HEIGHT + LINE_GAP;
const MAX_LINE_CHARS = 120; // max chars we represent visually

/**
 * Minimap — a canvas-based code overview panel rendered on the right side
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
  const isDragging = useRef(false);
  const [viewportRect, setViewportRect] = useState({ top: 0, height: 0 });

  const totalMinimapHeight = lines.length * MINIMAP_LINE_TOTAL;

  // Draw the minimap content on canvas
  const drawContent = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = MINIMAP_WIDTH;
    const displayHeight = totalMinimapHeight;

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, displayWidth, displayHeight);

    // Read CSS custom property colors
    const computedStyle = getComputedStyle(document.documentElement);
    const textColor = computedStyle.getPropertyValue('--text-muted').trim() || '#888';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.replace(/^\s+/, '');
      if (trimmed.length === 0) continue;

      const indent = line.length - trimmed.length;
      const charWidth = (MINIMAP_WIDTH - 4) / MAX_LINE_CHARS;
      const x = 2 + indent * charWidth;
      const w = Math.min(trimmed.length, MAX_LINE_CHARS - indent) * charWidth;
      const y = i * MINIMAP_LINE_TOTAL;

      ctx.fillStyle = textColor;
      ctx.globalAlpha = 0.4;
      ctx.fillRect(x, y, Math.max(w, 2), LINE_HEIGHT);
    }

    ctx.globalAlpha = 1;
  }, [lines, totalMinimapHeight]);

  // Update viewport indicator based on scroll position
  const updateViewport = useCallback(() => {
    if (!scrollContainer) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    if (scrollHeight === 0) return;

    const ratio = totalMinimapHeight / scrollHeight;
    const top = scrollTop * ratio;
    const height = clientHeight * ratio;

    setViewportRect({ top, height: Math.max(height, 10) });
  }, [scrollContainer, totalMinimapHeight]);

  // Draw content when lines change
  useEffect(() => {
    if (visible) drawContent();
  }, [visible, drawContent]);

  // Listen to scroll events on the main code container
  useEffect(() => {
    if (!scrollContainer || !visible) return;

    updateViewport();
    const handleScroll = () => updateViewport();
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [scrollContainer, visible, updateViewport]);

  // Also update on resize
  useEffect(() => {
    if (!visible) return;
    const handleResize = () => {
      drawContent();
      updateViewport();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [visible, drawContent, updateViewport]);

  // Scroll the main editor when clicking/dragging on the minimap
  const scrollToMinimapY = useCallback(
    (clientY: number) => {
      if (!scrollContainer || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const y = clientY - rect.top + containerRef.current.scrollTop;
      const ratio = y / totalMinimapHeight;
      const targetScroll =
        ratio * scrollContainer.scrollHeight - scrollContainer.clientHeight / 2;

      scrollContainer.scrollTop = Math.max(
        0,
        Math.min(targetScroll, scrollContainer.scrollHeight - scrollContainer.clientHeight)
      );
    },
    [scrollContainer, totalMinimapHeight]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      scrollToMinimapY(e.clientY);

      const handleMouseMove = (ev: MouseEvent) => {
        if (isDragging.current) {
          scrollToMinimapY(ev.clientY);
        }
      };
      const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [scrollToMinimapY]
  );

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      style={{
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
      }}
    >
      <canvas ref={canvasRef} />
      {/* Viewport indicator */}
      <div
        style={{
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
        }}
      />
    </div>
  );
});
