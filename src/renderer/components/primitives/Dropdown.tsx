import React from 'react';

export interface DropdownProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'end';
  open?: boolean;
}

const BASE =
  'bg-surface-overlay border border-border-semantic rounded-lg backdrop-blur-[24px] backdrop-saturate-[140%] overflow-hidden';

export function Dropdown({
  align = 'start',
  open = false,
  className,
  children,
  ...rest
}: DropdownProps): React.ReactElement | null {
  if (!open) return null;
  const alignClass = align === 'end' ? 'right-0' : 'left-0';
  const classes = `${BASE} ${alignClass} ${className ?? ''}`;
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
