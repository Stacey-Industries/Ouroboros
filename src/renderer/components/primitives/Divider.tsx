import React from 'react';

export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: 'horizontal' | 'vertical';
  subtle?: boolean;
}

export function Divider({
  direction = 'horizontal',
  subtle = false,
  className,
  ...rest
}: DividerProps): React.ReactElement {
  const dirClass =
    direction === 'horizontal' ? 'w-full h-px' : 'h-full w-px';
  const colorClass = subtle ? 'bg-border-semantic-subtle' : 'bg-border-semantic';
  const classes = `${dirClass} ${colorClass} ${className ?? ''}`;
  return <div className={classes} role="separator" {...rest} />;
}
