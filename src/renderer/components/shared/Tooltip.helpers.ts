import React from 'react';

const GAP = 6;
const VIEWPORT_PADDING = 4;

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipCoords {
  top: number;
  left: number;
  resolved: TooltipPosition;
}

type TooltipChildProps = {
  onMouseEnter?: React.MouseEventHandler<HTMLElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLElement>;
  onFocus?: React.FocusEventHandler<HTMLElement>;
  onBlur?: React.FocusEventHandler<HTMLElement>;
};

type TooltipChildElement = React.ReactElement<TooltipChildProps> & {
  ref?: React.Ref<HTMLElement>;
};

function resolveTooltipPosition(
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
  preferred: TooltipPosition,
): TooltipPosition {
  if (preferred === 'top' && triggerRect.top - tooltipRect.height - GAP < 0) {
    return 'bottom';
  }
  if (preferred === 'bottom' && triggerRect.bottom + tooltipRect.height + GAP > window.innerHeight) {
    return 'top';
  }
  if (preferred === 'left' && triggerRect.left - tooltipRect.width - GAP < 0) {
    return 'right';
  }
  if (preferred === 'right' && triggerRect.right + tooltipRect.width + GAP > window.innerWidth) {
    return 'left';
  }
  return preferred;
}

function buildTooltipCoords(
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
  resolved: TooltipPosition,
): Omit<TooltipCoords, 'resolved'> {
  switch (resolved) {
    case 'top':
      return {
        top: triggerRect.top - tooltipRect.height - GAP,
        left: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
      };
    case 'bottom':
      return {
        top: triggerRect.bottom + GAP,
        left: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
      };
    case 'left':
      return {
        top: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
        left: triggerRect.left - tooltipRect.width - GAP,
      };
    case 'right':
      return {
        top: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
        left: triggerRect.right + GAP,
      };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function computePosition(
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
  preferred: TooltipPosition,
): TooltipCoords {
  const resolved = resolveTooltipPosition(triggerRect, tooltipRect, preferred);
  const coords = buildTooltipCoords(triggerRect, tooltipRect, resolved);
  return {
    resolved,
    left: clamp(coords.left, VIEWPORT_PADDING, window.innerWidth - tooltipRect.width - VIEWPORT_PADDING),
    top: clamp(coords.top, VIEWPORT_PADDING, window.innerHeight - tooltipRect.height - VIEWPORT_PADDING),
  };
}

function setElementRef(ref: React.Ref<HTMLElement> | undefined, node: HTMLElement | null): void {
  if (typeof ref === 'function') {
    ref(node);
    return;
  }

  if (ref && typeof ref === 'object') {
    (ref as React.MutableRefObject<HTMLElement | null>).current = node;
  }
}

function wrapMouseHandler(
  action: () => void,
  handler?: React.MouseEventHandler<HTMLElement>,
): React.MouseEventHandler<HTMLElement> {
  return (event) => {
    action();
    handler?.(event);
  };
}

function wrapFocusHandler(
  action: () => void,
  handler?: React.FocusEventHandler<HTMLElement>,
): React.FocusEventHandler<HTMLElement> {
  return (event) => {
    action();
    handler?.(event);
  };
}

export function cloneTooltipChild(args: {
  children: React.ReactElement;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
  show: () => void;
  hide: () => void;
}): React.ReactElement {
  const child = args.children as TooltipChildElement;
  return React.cloneElement(child, {
    ref: (node: HTMLElement | null) => {
      args.triggerRef.current = node;
      setElementRef(child.ref, node);
    },
    onMouseEnter: wrapMouseHandler(args.show, child.props.onMouseEnter),
    onMouseLeave: wrapMouseHandler(args.hide, child.props.onMouseLeave),
    onFocus: wrapFocusHandler(args.show, child.props.onFocus),
    onBlur: wrapFocusHandler(args.hide, child.props.onBlur),
  } as Record<string, unknown>);
}
