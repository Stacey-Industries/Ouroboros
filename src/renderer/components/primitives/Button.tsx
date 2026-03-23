import React from 'react';

import type { ButtonSize,ButtonVariant } from './types';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: boolean;
}

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors duration-100 disabled:opacity-40 disabled:pointer-events-none';

const variantClass: Record<ButtonVariant, string> = {
  'primary':
    'bg-interactive-accent text-text-semantic-on-accent hover:bg-interactive-hover',
  'ghost':
    'bg-transparent text-text-semantic-muted hover:bg-interactive-muted hover:text-text-semantic-primary',
  'danger':
    'bg-transparent text-status-error hover:bg-[rgba(248,81,73,0.1)]',
  'accent-muted':
    'bg-interactive-muted text-text-semantic-primary',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = 'ghost', size = 'md', icon = false, className, children, ...rest },
    ref,
  ) {
    const padding = icon ? 'p-1.5 aspect-square' : sizeClass[size];
    const classes = `${BASE} ${variantClass[variant]} ${padding} ${className ?? ''}`;
    return (
      <button ref={ref} className={classes} {...rest}>
        {children}
      </button>
    );
  },
);
