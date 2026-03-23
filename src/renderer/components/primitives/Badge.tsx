import React from 'react';

import type { BadgeVariant } from './types';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
}

const variantClass: Record<BadgeVariant, string> = {
  default: 'bg-surface-raised text-text-semantic-secondary',
  success: 'bg-status-success/20 text-status-success',
  warning: 'bg-status-warning/20 text-status-warning',
  error:   'bg-status-error/20 text-status-error',
  accent:  'bg-interactive-accent text-text-semantic-on-accent',
  muted:   'bg-interactive-muted text-text-semantic-muted',
};

const sizeClass = { sm: 'px-1.5 py-0.5 text-[10px]', md: 'px-2 py-0.5 text-xs' };

const BASE = 'inline-flex items-center rounded-full font-medium';

export function Badge({
  variant = 'default',
  size = 'sm',
  className,
  children,
  ...rest
}: BadgeProps): React.ReactElement {
  const classes = `${BASE} ${variantClass[variant]} ${sizeClass[size]} ${className ?? ''}`;
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
