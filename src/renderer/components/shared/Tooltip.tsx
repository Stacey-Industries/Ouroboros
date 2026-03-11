/**
 * Tooltip.tsx — Consistent hover tooltip component.
 *
 * Wraps any child element and shows a tooltip after a 500ms hover delay.
 * Positioned above by default, flips if near the edge.
 * Uses CSS custom properties for theme compatibility.
 */

import React, { useState, useRef, useCallback, useEffect, memo } from 'react';

// ── Inject tooltip styles once ──────────────────────────────────────────────

if (typeof document !== 'undefined') {
  const styleId = '__tooltip-styles__';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
@keyframes tooltip-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.agent-ide-tooltip {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  animation: tooltip-fade-in 150ms ease-out forwards;
  opacity: 0;
}

.agent-ide-tooltip__body {
  background: var(--bg-tertiary, #333);
  color: var(--text, #eee);
  border: 1px solid var(--border, #555);
  font-family: var(--font-ui, system-ui);
  font-size: 11px;
  line-height: 1.3;
  padding: 4px 8px;
  border-radius: 4px;
  white-space: nowrap;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.agent-ide-tooltip__arrow {
  position: absolute;
  width: 6px;
  height: 6px;
  background: var(--bg-tertiary, #333);
  border: 1px solid var(--border, #555);
  transform: rotate(45deg);
}

/* Arrow for top position (arrow points down) */
.agent-ide-tooltip--top .agent-ide-tooltip__arrow {
  bottom: -4px;
  left: 50%;
  margin-left: -3px;
  border-top: none;
  border-left: none;
}

/* Arrow for bottom position (arrow points up) */
.agent-ide-tooltip--bottom .agent-ide-tooltip__arrow {
  top: -4px;
  left: 50%;
  margin-left: -3px;
  border-bottom: none;
  border-right: none;
}

/* Arrow for left position (arrow points right) */
.agent-ide-tooltip--left .agent-ide-tooltip__arrow {
  right: -4px;
  top: 50%;
  margin-top: -3px;
  border-top: none;
  border-left: none;
}

/* Arrow for right position (arrow points left) */
.agent-ide-tooltip--right .agent-ide-tooltip__arrow {
  left: -4px;
  top: 50%;
  margin-top: -3px;
  border-bottom: none;
  border-right: none;
}
`;
    document.head.appendChild(style);
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** The text to show in the tooltip */
  text: string;
  /** Preferred position. Defaults to 'top'. Flips if near edge. */
  position?: TooltipPosition;
  /** Delay in ms before showing. Defaults to 500. */
  delay?: number;
  /** The wrapped element */
  children: React.ReactElement;
  /** Disable the tooltip (e.g. when a menu is open) */
  disabled?: boolean;
}

// ── Positioning logic ───────────────────────────────────────────────────────

const GAP = 6; // px between trigger and tooltip

function computePosition(
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
  preferred: TooltipPosition,
): { top: number; left: number; resolved: TooltipPosition } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Try preferred, flip if it doesn't fit
  let resolved = preferred;

  if (preferred === 'top' && triggerRect.top - tooltipRect.height - GAP < 0) {
    resolved = 'bottom';
  } else if (preferred === 'bottom' && triggerRect.bottom + tooltipRect.height + GAP > vh) {
    resolved = 'top';
  } else if (preferred === 'left' && triggerRect.left - tooltipRect.width - GAP < 0) {
    resolved = 'right';
  } else if (preferred === 'right' && triggerRect.right + tooltipRect.width + GAP > vw) {
    resolved = 'left';
  }

  let top = 0;
  let left = 0;

  switch (resolved) {
    case 'top':
      top = triggerRect.top - tooltipRect.height - GAP;
      left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      break;
    case 'bottom':
      top = triggerRect.bottom + GAP;
      left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      break;
    case 'left':
      top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
      left = triggerRect.left - tooltipRect.width - GAP;
      break;
    case 'right':
      top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
      left = triggerRect.right + GAP;
      break;
  }

  // Clamp to viewport
  left = Math.max(4, Math.min(left, vw - tooltipRect.width - 4));
  top = Math.max(4, Math.min(top, vh - tooltipRect.height - 4));

  return { top, left, resolved };
}

// ── Component ───────────────────────────────────────────────────────────────

export const Tooltip = memo(function Tooltip({
  text,
  position = 'top',
  delay = 500,
  children,
  disabled = false,
}: TooltipProps): React.ReactElement {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; resolved: TooltipPosition } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (disabled) return;
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, delay);
  }, [delay, disabled]);

  const hide = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
    setCoords(null);
  }, []);

  // Position the tooltip once it becomes visible
  useEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const pos = computePosition(triggerRect, tooltipRect, position);
    setCoords(pos);
  }, [visible, position]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Clone the child to attach event listeners and ref
  const child = React.cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      // Forward ref if the child has one
      const childRef = (children as React.ReactElement & { ref?: React.Ref<HTMLElement> }).ref;
      if (typeof childRef === 'function') {
        childRef(node);
      } else if (childRef && typeof childRef === 'object') {
        (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      show();
      children.props.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hide();
      children.props.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      show();
      children.props.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      hide();
      children.props.onBlur?.(e);
    },
  } as Record<string, unknown>);

  return (
    <>
      {child}
      {visible && (
        <div
          ref={tooltipRef}
          className={`agent-ide-tooltip agent-ide-tooltip--${coords?.resolved ?? position}`}
          style={{
            top: coords ? coords.top : -9999,
            left: coords ? coords.left : -9999,
          }}
          role="tooltip"
        >
          <div className="agent-ide-tooltip__body">{text}</div>
          <div className="agent-ide-tooltip__arrow" />
        </div>
      )}
    </>
  );
});
