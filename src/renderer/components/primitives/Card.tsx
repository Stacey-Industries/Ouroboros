import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const BASE = 'bg-surface-panel border border-border-semantic rounded-lg';

const paddingClass = { none: 'p-0', sm: 'p-2', md: 'p-3', lg: 'p-4' };

export function Card({
  glass = false,
  padding = 'md',
  className,
  children,
  ...rest
}: CardProps): React.ReactElement {
  const glassClass = glass ? 'glass-card' : '';
  const classes = `${BASE} ${paddingClass[padding]} ${glassClass} ${className ?? ''}`;
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
