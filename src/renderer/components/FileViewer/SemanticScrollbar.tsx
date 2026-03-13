import React, { useCallback, useRef, useState, memo } from 'react';
import type { DiffLineInfo } from '../../types/electron';

export interface SemanticScrollbarProps {
  /** Total number of lines in the file */
  totalLines: number;
  /** Current scrollTop of the code scroll container */
  scrollTop: number;
  /** Visible height of the code scroll container */
  containerHeight: number;
  /** Total scrollable height of the code scroll container */
  scrollHeight: number;
  /** Line height in pixels */
  lineHeight: number;
  /** 1-based line numbers of search matches */
  searchMatchLines: number[];
  /** Per-line git diff info (1-based line numbers) */
  diffLines: DiffLineInfo[];
  /** 0-based start-line indices of collapsed fold regions */
  foldedLines: number[];
  /** Called when the user clicks a mark to scroll to a line */
  onScrollToLine: (line: number) => void;
}

const SCROLLBAR_WIDTH = 12;
const MARK_HEIGHT = 2;
const EDGE_PADDING = 12; // top/bottom padding to avoid scrollbar arrows

interface Mark {
  /** 0–1 fraction of total height */
  position: number;
  color: string;
  label: string;
  /** 1-based line number */
  line: number;
}

interface Tooltip {
  visible: boolean;
  label: string;
  y: number; // px from top of scrollbar container
}

/**
 * SemanticScrollbar — an absolutely-positioned overlay on the right edge of
 * the code scroll area that shows colored tick marks for:
 *  - Search matches (yellow)
 *  - Git diff lines (green = added, blue = modified, red = deleted)
 *  - Collapsed fold start lines (grey)
 *
 * Clicking a mark scrolls the viewer to that line.
 */
export const SemanticScrollbar = memo(function SemanticScrollbar({
  totalLines,
  scrollTop,
  containerHeight,
  scrollHeight,
  searchMatchLines,
  diffLines,
  foldedLines,
  onScrollToLine,
}: SemanticScrollbarProps): React.ReactElement | null {
  const barRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip>({ visible: false, label: '', y: 0 });

  const handleMarkClick = useCallback(
    (line: number) => {
      onScrollToLine(line);
    },
    [onScrollToLine]
  );

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const y = e.clientY - rect.top;
    setTooltip((prev) => ({ ...prev, y }));
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltip({ visible: false, label: '', y: 0 });
  }, []);

  if (totalLines === 0 || containerHeight === 0) return null;

  // Build mark list — deduplicate by line (search > diff > fold priority)
  const seen = new Set<number>();
  const marks: Mark[] = [];

  // Folds first (lowest priority — will be overwritten by higher priority items)
  for (const startLine of foldedLines) {
    const line1 = startLine + 1; // convert to 1-based
    if (!seen.has(line1)) {
      seen.add(line1);
      marks.push({
        position: (line1 - 1) / Math.max(totalLines - 1, 1),
        color: 'var(--text-faint)',
        label: `Line ${line1} (fold)`,
        line: line1,
      });
    }
  }

  // Diff lines (medium priority)
  for (const dl of diffLines) {
    if (!seen.has(dl.line)) {
      seen.add(dl.line);
      let color: string;
      let kindLabel: string;
      if (dl.kind === 'added') {
        color = '#3fb950';
        kindLabel = 'added';
      } else if (dl.kind === 'deleted') {
        color = '#f85149';
        kindLabel = 'deleted';
      } else {
        color = '#58a6ff';
        kindLabel = 'modified';
      }
      marks.push({
        position: (dl.line - 1) / Math.max(totalLines - 1, 1),
        color,
        label: `Line ${dl.line} (${kindLabel})`,
        line: dl.line,
      });
    }
  }

  // Search matches (highest priority — replace any existing entry for same line)
  for (const lineNum of searchMatchLines) {
    if (!seen.has(lineNum)) {
      seen.add(lineNum);
    }
    // Always add; if a mark for this line already exists from diff/fold it will
    // appear underneath — we push the search mark on top.
    marks.push({
      position: (lineNum - 1) / Math.max(totalLines - 1, 1),
      color: 'rgba(255, 200, 0, 0.9)',
      label: `Line ${lineNum} (match)`,
      line: lineNum,
    });
  }

  // Available height for marks (between the edge paddings)
  const trackHeight = containerHeight - EDGE_PADDING * 2;
  if (trackHeight <= 0) return null;

  // Viewport indicator: which fraction of the total content is currently visible
  const viewportFraction = Math.min(containerHeight / Math.max(scrollHeight, 1), 1);
  const viewportTop = EDGE_PADDING + (scrollTop / Math.max(scrollHeight - containerHeight, 1)) * (trackHeight - viewportFraction * trackHeight);
  const viewportHeight = Math.max(viewportFraction * trackHeight, 4);

  return (
    <div
      ref={barRef}
      aria-hidden="true"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: `${SCROLLBAR_WIDTH}px`,
        pointerEvents: 'none', // container passes through clicks; marks handle their own
        zIndex: 10,
      }}
    >
      {/* Viewport indicator band */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          left: 0,
          top: `${viewportTop}px`,
          height: `${viewportHeight}px`,
          backgroundColor: 'rgba(128, 128, 128, 0.12)',
          borderTop: '1px solid rgba(128, 128, 128, 0.2)',
          borderBottom: '1px solid rgba(128, 128, 128, 0.2)',
          pointerEvents: 'none',
        }}
      />

      {/* Tick marks */}
      {marks.map((mark, idx) => {
        const top = EDGE_PADDING + mark.position * trackHeight - MARK_HEIGHT / 2;
        return (
          <div
            key={`${mark.line}-${mark.color}-${idx}`}
            title={mark.label}
            onClick={() => handleMarkClick(mark.line)}
            onMouseEnter={() =>
              setTooltip({ visible: true, label: mark.label, y: top + MARK_HEIGHT / 2 })
            }
            style={{
              position: 'absolute',
              right: 1,
              left: 1,
              top: `${top}px`,
              height: `${MARK_HEIGHT}px`,
              backgroundColor: mark.color,
              borderRadius: '1px',
              cursor: 'pointer',
              pointerEvents: 'all',
              zIndex: 11,
            }}
          />
        );
      })}

      {/* Tooltip */}
      {tooltip.visible && (
        <div
          style={{
            position: 'absolute',
            right: `${SCROLLBAR_WIDTH + 4}px`,
            top: `${Math.max(0, tooltip.y - 10)}px`,
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            padding: '2px 6px',
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-ui)',
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 30,
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
          }}
        >
          {tooltip.label}
        </div>
      )}
    </div>
  );
});
