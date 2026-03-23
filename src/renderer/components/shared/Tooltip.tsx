/**
 * Tooltip.tsx - Consistent hover tooltip component.
 *
 * Wraps any child element and shows a tooltip after a hover delay.
 * Positioned above by default and flips if needed near viewport edges.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

import {
  cloneTooltipChild,
  computePosition,
  type TooltipCoords,
  type TooltipPosition,
} from './Tooltip.helpers';

const TOOLTIP_STYLE_ID = '__tooltip-styles__';
export type { TooltipPosition } from './Tooltip.helpers';

if (typeof document !== 'undefined' && !document.getElementById(TOOLTIP_STYLE_ID)) {
  const style = document.createElement('style');
  style.id = TOOLTIP_STYLE_ID;
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

.agent-ide-tooltip--top .agent-ide-tooltip__arrow {
  bottom: -4px;
  left: 50%;
  margin-left: -3px;
  border-top: none;
  border-left: none;
}

.agent-ide-tooltip--bottom .agent-ide-tooltip__arrow {
  top: -4px;
  left: 50%;
  margin-left: -3px;
  border-bottom: none;
  border-right: none;
}

.agent-ide-tooltip--left .agent-ide-tooltip__arrow {
  right: -4px;
  top: 50%;
  margin-top: -3px;
  border-top: none;
  border-left: none;
}

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

function useTooltipVisibility(delay: number, disabled: boolean): {
  visible: boolean;
  coords: TooltipCoords | null;
  setCoords: React.Dispatch<React.SetStateAction<TooltipCoords | null>>;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
  tooltipRef: React.MutableRefObject<HTMLDivElement | null>;
  clearTimer: () => void;
  show: () => void;
  hide: () => void;
} {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<TooltipCoords | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    if (disabled) {
      return;
    }

    clearTimer();
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, delay);
  }, [clearTimer, delay, disabled]);

  const hide = useCallback(() => {
    clearTimer();
    setVisible(false);
    setCoords(null);
  }, [clearTimer]);

  return { visible, coords, setCoords, triggerRef, tooltipRef, clearTimer, show, hide };
}

function useTooltipPositioning(args: {
  visible: boolean;
  position: TooltipPosition;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
  tooltipRef: React.MutableRefObject<HTMLDivElement | null>;
  setCoords: React.Dispatch<React.SetStateAction<TooltipCoords | null>>;
}): void {
  const { visible, position, triggerRef, tooltipRef, setCoords } = args;
  useEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) {
      return;
    }

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    setCoords(computePosition(triggerRect, tooltipRect, position));
  }, [position, setCoords, tooltipRef, triggerRef, visible]);
}

function useTooltipCleanup(clearTimer: () => void): void {
  useEffect(() => clearTimer, [clearTimer]);
}

function TooltipPopup(args: {
  visible: boolean;
  coords: TooltipCoords | null;
  position: TooltipPosition;
  text: string;
  tooltipRef: React.MutableRefObject<HTMLDivElement | null>;
}): React.ReactElement | null {
  const { visible, coords, position, text, tooltipRef } = args;
  if (!visible) {
    return null;
  }

  return (
    <div
      ref={tooltipRef}
      className={`agent-ide-tooltip agent-ide-tooltip--${coords?.resolved ?? position}`}
      style={{ top: coords ? coords.top : -9999, left: coords ? coords.left : -9999 }}
      role="tooltip"
    >
      <div className="agent-ide-tooltip__body">{text}</div>
      <div className="agent-ide-tooltip__arrow" />
    </div>
  );
}

export const Tooltip = memo(function Tooltip({
  text,
  position = 'top',
  delay = 500,
  children,
  disabled = false,
}: TooltipProps): React.ReactElement {
  const tooltip = useTooltipVisibility(delay, disabled);
  useTooltipPositioning({
    visible: tooltip.visible,
    position,
    triggerRef: tooltip.triggerRef,
    tooltipRef: tooltip.tooltipRef,
    setCoords: tooltip.setCoords,
  });
  useTooltipCleanup(tooltip.clearTimer);
  const child = cloneTooltipChild({ children, triggerRef: tooltip.triggerRef, show: tooltip.show, hide: tooltip.hide });

  return (
    <>
      {child}
      <TooltipPopup
        visible={tooltip.visible}
        coords={tooltip.coords}
        position={position}
        text={text}
        tooltipRef={tooltip.tooltipRef}
      />
    </>
  );
});
