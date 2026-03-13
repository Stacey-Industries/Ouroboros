import React, { useCallback, useRef, useState, memo } from 'react';
import {
  HIDDEN_TOOLTIP,
  SemanticScrollbarOverlay,
  buildMarks,
  getViewportMetrics,
  updateTooltipPosition,
} from './SemanticScrollbar.shared';
import type { DiffLineInfo } from '../../types/electron';

export interface SemanticScrollbarProps {
  totalLines: number;
  scrollTop: number;
  containerHeight: number;
  scrollHeight: number;
  lineHeight: number;
  searchMatchLines: number[];
  diffLines: DiffLineInfo[];
  foldedLines: number[];
  onScrollToLine: (line: number) => void;
}

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
  const [tooltip, setTooltip] = useState(HIDDEN_TOOLTIP);
  const metrics = getViewportMetrics(scrollTop, containerHeight, scrollHeight);
  const marks = buildMarks(totalLines, foldedLines, diffLines, searchMatchLines);
  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) =>
      updateTooltipPosition(event, barRef.current, setTooltip),
    []
  );
  const handleMouseLeave = useCallback(() => {
    setTooltip(HIDDEN_TOOLTIP);
  }, []);
  if (totalLines === 0 || containerHeight === 0 || !metrics) return null;
  return (
    <SemanticScrollbarOverlay
      barRef={barRef}
      handleMouseLeave={handleMouseLeave}
      handleMouseMove={handleMouseMove}
      marks={marks}
      metrics={metrics}
      onScrollToLine={onScrollToLine}
      setTooltip={setTooltip}
      tooltip={tooltip}
    />
  );
});
