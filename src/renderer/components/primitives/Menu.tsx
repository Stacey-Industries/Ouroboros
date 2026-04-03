import React from 'react';

export interface MenuProps extends React.HTMLAttributes<HTMLDivElement> {
  role?: 'menu' | 'listbox';
}

export interface MenuItemProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  disabled?: boolean;
}

const MENU_BASE = 'py-1';

const ITEM_BASE =
  'px-3 py-1.5 text-sm cursor-pointer transition-colors duration-100';

export function Menu({
  role = 'menu',
  className,
  children,
  ...rest
}: MenuProps): React.ReactElement {
  return (
    <div role={role} className={`${MENU_BASE} ${className ?? ''}`} {...rest}>
      {children}
    </div>
  );
}

export function MenuItem({
  selected = false,
  disabled = false,
  className,
  children,
  ...rest
}: MenuItemProps): React.ReactElement {
  const stateClass = selected
    ? 'bg-interactive-accent text-text-semantic-on-accent'
    : 'hover:bg-interactive-muted text-text-semantic-primary';
  const disabledClass = disabled ? 'opacity-40 pointer-events-none' : '';
  const classes = `${ITEM_BASE} ${stateClass} ${disabledClass} ${className ?? ''}`;
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
