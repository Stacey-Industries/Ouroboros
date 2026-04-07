import React, { useRef } from 'react';

export interface MenuProps extends React.HTMLAttributes<HTMLDivElement> {
  role?: 'menu' | 'listbox';
  onClose?: () => void;
}

export interface MenuItemProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  disabled?: boolean;
}

const MENU_BASE = 'py-1';

const ITEM_BASE = 'px-3 py-1.5 text-sm cursor-pointer transition-colors duration-100';

const ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"])';

function getFocusableItems(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
}

function moveFocus(items: HTMLElement[], current: HTMLElement, delta: number): void {
  const idx = items.indexOf(current);
  const next = items[(idx + delta + items.length) % items.length];
  next?.focus();
}

function handleMenuKeyDown(
  event: React.KeyboardEvent<HTMLDivElement>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  onClose?: () => void,
): void {
  const container = containerRef.current;
  if (!container) return;
  const items = getFocusableItems(container);
  const active = document.activeElement as HTMLElement;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveFocus(items, active, 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveFocus(items, active, -1);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    onClose?.();
  }
}

export function Menu({
  role = 'menu',
  className,
  children,
  onClose,
  onKeyDown,
  ...rest
}: MenuProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const combinedKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    handleMenuKeyDown(event, containerRef, onClose);
    onKeyDown?.(event);
  };
  return (
    <div
      ref={containerRef}
      role={role}
      className={`${MENU_BASE} ${className ?? ''}`}
      onKeyDown={combinedKeyDown}
      {...rest}
    >
      {children}
    </div>
  );
}

export function MenuItem({
  selected = false,
  disabled = false,
  className,
  children,
  onClick,
  onKeyDown,
  ...rest
}: MenuItemProps): React.ReactElement {
  const stateClass = selected
    ? 'bg-interactive-accent text-text-semantic-on-accent'
    : 'hover:bg-interactive-muted text-text-semantic-primary';
  const disabledClass = disabled ? 'opacity-40 pointer-events-none' : '';
  const classes = `${ITEM_BASE} ${stateClass} ${disabledClass} ${className ?? ''}`;

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick?.(event as unknown as React.MouseEvent<HTMLDivElement>);
    }
    onKeyDown?.(event);
  }

  return (
    <div
      role="menuitem"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      className={classes}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {children}
    </div>
  );
}
