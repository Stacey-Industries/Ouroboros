import React, { memo, useMemo } from 'react';

export interface ScrollIndicatorProps {
  /** Current scroll offset from top (px) */
  scrollTop: number;
  /** Total scrollable content height (px) */
  scrollHeight: number;
  /** Visible viewport height (px) */
  clientHeight: number;
  /** Whether the parent area is hovered */
  isHovered?: boolean;
  /** Whether the user is actively scrolling */
  isScrolling?: boolean;
}

const MIN_BAR_HEIGHT_PX = 20;

const trackStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  width: '4px',
  height: '100%',
  backgroundColor: 'var(--surface-raised)',
  zIndex: 5,
  pointerEvents: 'none',
  transition: 'opacity 200ms ease',
};

const thumbBaseStyle: React.CSSProperties = {
  position: 'absolute',
  width: '100%',
  backgroundColor: 'var(--interactive-accent)',
  borderRadius: '2px',
  transition: 'top 50ms ease-out, opacity 200ms ease',
};

/**
 * ScrollIndicator -- thin vertical bar on the right edge of the editor
 * showing the viewport's position within the total file content.
 *
 * Does not capture pointer events -- purely visual.
 */
export const ScrollIndicator = memo(function ScrollIndicator({
  scrollTop,
  scrollHeight,
  clientHeight,
  isHovered = false,
  isScrolling = false,
}: ScrollIndicatorProps): React.ReactElement | null {
  // Don't render if the content fits entirely within the viewport
  const overflows = scrollHeight > clientHeight && clientHeight > 0;

  const metrics = useMemo(() => {
    if (!overflows) return null;

    const ratio = clientHeight / scrollHeight;
    const heightPercent = Math.max(ratio * 100, (MIN_BAR_HEIGHT_PX / clientHeight) * 100);

    const maxScrollTop = scrollHeight - clientHeight;
    const scrollFraction = maxScrollTop > 0 ? scrollTop / maxScrollTop : 0;
    const topPercent = scrollFraction * (100 - heightPercent);

    return { heightPercent, topPercent };
  }, [overflows, scrollTop, scrollHeight, clientHeight]);

  if (!overflows || !metrics) return null;

  // Visible during scrolling; subtle on hover; faded otherwise
  const trackOpacity = isScrolling ? 0.6 : isHovered ? 0.35 : 0.15;
  const thumbOpacity = isScrolling ? 0.7 : isHovered ? 0.5 : 0.3;

  return (
    <div style={{ ...trackStyle, opacity: trackOpacity }}>
      <div
        style={{
          ...thumbBaseStyle,
          top: `${metrics.topPercent}%`,
          height: `${metrics.heightPercent}%`,
          opacity: thumbOpacity,
        }}
      />
    </div>
  );
});
