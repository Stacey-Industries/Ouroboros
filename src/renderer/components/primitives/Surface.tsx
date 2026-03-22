import React from 'react';
import type { SurfaceLevel, Radius } from './types';

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  level?: SurfaceLevel;
  bordered?: boolean;
  radius?: Radius;
  as?: 'div' | 'section' | 'aside' | 'nav' | 'main';
}

const levelClass: Record<SurfaceLevel, string> = {
  base:    'bg-surface-base',
  panel:   'bg-surface-panel',
  raised:  'bg-surface-raised',
  overlay: 'bg-surface-overlay',
  inset:   'bg-surface-inset',
};

const radiusClass: Record<Radius, string> = {
  none: 'rounded-none',
  sm:   'rounded-sm',
  md:   'rounded-md',
  lg:   'rounded-lg',
};

export function Surface({
  level = 'base',
  bordered = false,
  radius = 'md',
  as: Tag = 'div',
  className,
  children,
  ...rest
}: SurfaceProps): React.ReactElement {
  const base = `${levelClass[level]} ${radiusClass[radius]}`;
  const border = bordered ? 'border border-border-semantic' : '';
  return (
    <Tag className={`${base} ${border} ${className ?? ''}`} {...(rest as React.HTMLAttributes<HTMLElement>)}>
      {children}
    </Tag>
  );
}
