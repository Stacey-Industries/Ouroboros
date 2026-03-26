import React from 'react';

import type { DiffLineInfo } from '../../types/electron';

export interface Tooltip {
  visible: boolean;
  label: string;
  y: number;
}

export interface ViewportMetrics {
  top: number;
  height: number;
  trackHeight: number;
}

interface Mark {
  position: number;
  color: string;
  label: string;
  line: number;
}

interface ScrollbarMarkListProps {
  marks: Mark[];
  onScrollToLine: (line: number) => void;
  setTooltip: React.Dispatch<React.SetStateAction<Tooltip>>;
  trackHeight: number;
}

interface ScrollbarMarkProps {
  mark: Mark;
  onScrollToLine: (line: number) => void;
  setTooltip: React.Dispatch<React.SetStateAction<Tooltip>>;
  trackHeight: number;
}

export interface SemanticScrollbarOverlayProps {
  barRef: React.RefObject<HTMLDivElement | null>;
  handleMouseLeave: () => void;
  handleMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void;
  marks: ReturnType<typeof buildMarks>;
  metrics: ViewportMetrics;
  onScrollToLine: (line: number) => void;
  setTooltip: React.Dispatch<React.SetStateAction<Tooltip>>;
  tooltip: Tooltip;
}

const SCROLLBAR_WIDTH = 12;
const MARK_HEIGHT = 2;
const EDGE_PADDING = 12;

const DIFF_MARK_APPEARANCE = {
  added: { color: 'var(--status-success)', label: 'added' },
  deleted: { color: 'var(--status-error)', label: 'deleted' },
  modified: { color: 'var(--interactive-accent)', label: 'modified' },
} as const;

export const HIDDEN_TOOLTIP: Tooltip = { visible: false, label: '', y: 0 };

function getDiffMarkAppearance(kind: DiffLineInfo['kind']) {
  return (
    DIFF_MARK_APPEARANCE[kind as keyof typeof DIFF_MARK_APPEARANCE] ?? DIFF_MARK_APPEARANCE.modified
  );
}

function getMarkPosition(line: number, totalLines: number): number {
  return (line - 1) / Math.max(totalLines - 1, 1);
}

function createFoldMarks(foldedLines: number[], totalLines: number, seen: Set<number>): Mark[] {
  const marks: Mark[] = [];
  for (const startLine of foldedLines) {
    const line = startLine + 1;
    if (seen.has(line)) continue;
    seen.add(line);
    marks.push({
      position: getMarkPosition(line, totalLines),
      color: 'var(--text-faint)',
      label: `Line ${line} (fold)`,
      line,
    });
  }
  return marks;
}

function createDiffMarks(diffLines: DiffLineInfo[], totalLines: number, seen: Set<number>): Mark[] {
  const marks: Mark[] = [];
  for (const diffLine of diffLines) {
    if (seen.has(diffLine.line)) continue;
    seen.add(diffLine.line);
    const appearance = getDiffMarkAppearance(diffLine.kind);
    marks.push({
      position: getMarkPosition(diffLine.line, totalLines),
      color: appearance.color,
      label: `Line ${diffLine.line} (${appearance.label})`,
      line: diffLine.line,
    });
  }
  return marks;
}

function createSearchMarks(
  searchMatchLines: number[],
  totalLines: number,
  seen: Set<number>,
): Mark[] {
  const marks: Mark[] = [];
  for (const line of searchMatchLines) {
    seen.add(line);
    marks.push({
      position: getMarkPosition(line, totalLines),
      color: 'rgba(255, 200, 0, 0.9)',
      label: `Line ${line} (match)`,
      line,
    });
  }
  return marks;
}

export function buildMarks(
  totalLines: number,
  foldedLines: number[],
  diffLines: DiffLineInfo[],
  searchMatchLines: number[],
): Mark[] {
  const seen = new Set<number>();
  return [
    ...createFoldMarks(foldedLines, totalLines, seen),
    ...createDiffMarks(diffLines, totalLines, seen),
    ...createSearchMarks(searchMatchLines, totalLines, seen),
  ];
}

export function getViewportMetrics(
  scrollTop: number,
  containerHeight: number,
  scrollHeight: number,
): ViewportMetrics | null {
  const trackHeight = containerHeight - EDGE_PADDING * 2;
  if (trackHeight <= 0) return null;
  const viewportFraction = Math.min(containerHeight / Math.max(scrollHeight, 1), 1);
  const top =
    EDGE_PADDING +
    (scrollTop / Math.max(scrollHeight - containerHeight, 1)) *
      (trackHeight - viewportFraction * trackHeight);
  return {
    top,
    height: Math.max(viewportFraction * trackHeight, 4),
    trackHeight,
  };
}

export function updateTooltipPosition(
  event: React.MouseEvent<HTMLDivElement>,
  scrollbar: HTMLDivElement | null,
  setTooltip: React.Dispatch<React.SetStateAction<Tooltip>>,
): void {
  if (!scrollbar) return;
  const rect = scrollbar.getBoundingClientRect();
  setTooltip((previous) => ({ ...previous, y: event.clientY - rect.top }));
}

function ViewportIndicator({
  top,
  height,
}: Omit<ViewportMetrics, 'trackHeight'>): React.ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        left: 0,
        top: `${top}px`,
        height: `${height}px`,
        backgroundColor: 'rgba(128, 128, 128, 0.12)',
        borderTop: '1px solid rgba(128, 128, 128, 0.2)',
        borderBottom: '1px solid rgba(128, 128, 128, 0.2)',
        pointerEvents: 'none',
      }}
    />
  );
}

function ScrollbarMark({
  mark,
  onScrollToLine,
  setTooltip,
  trackHeight,
}: ScrollbarMarkProps): React.ReactElement {
  const top = EDGE_PADDING + mark.position * trackHeight - MARK_HEIGHT / 2;
  return (
    <div
      title={mark.label}
      onClick={() => onScrollToLine(mark.line)}
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
}

function ScrollbarMarkList({
  marks,
  onScrollToLine,
  setTooltip,
  trackHeight,
}: ScrollbarMarkListProps): React.ReactElement {
  return (
    <>
      {marks.map((mark, index) => (
        <ScrollbarMark
          key={`${mark.line}-${mark.color}-${index}`}
          mark={mark}
          onScrollToLine={onScrollToLine}
          setTooltip={setTooltip}
          trackHeight={trackHeight}
        />
      ))}
    </>
  );
}

function ScrollbarTooltip({ tooltip }: { tooltip: Tooltip }): React.ReactElement | null {
  if (!tooltip.visible) return null;
  return (
    <div
      className="text-text-semantic-muted"
      style={{
        position: 'absolute',
        right: `${SCROLLBAR_WIDTH + 4}px`,
        top: `${Math.max(0, tooltip.y - 10)}px`,
        backgroundColor: 'var(--surface-panel)',
        border: '1px solid var(--border-semantic)',
        borderRadius: '4px',
        padding: '2px 6px',
        fontSize: '0.6875rem',
        fontFamily: 'var(--font-ui)',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        zIndex: 30,
        boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
      }}
    >
      {tooltip.label}
    </div>
  );
}

export function SemanticScrollbarOverlay({
  barRef,
  handleMouseLeave,
  handleMouseMove,
  marks,
  metrics,
  onScrollToLine,
  setTooltip,
  tooltip,
}: SemanticScrollbarOverlayProps): React.ReactElement {
  return (
    <div
      ref={barRef as React.RefObject<HTMLDivElement>}
      aria-hidden="true"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: `${SCROLLBAR_WIDTH}px`,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <ViewportIndicator height={metrics.height} top={metrics.top} />
      <ScrollbarMarkList
        marks={marks}
        onScrollToLine={onScrollToLine}
        setTooltip={setTooltip}
        trackHeight={metrics.trackHeight}
      />
      <ScrollbarTooltip tooltip={tooltip} />
    </div>
  );
}
