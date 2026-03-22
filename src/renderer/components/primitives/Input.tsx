import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  inputSize?: 'sm' | 'md';
  error?: boolean;
}

const BASE =
  'bg-surface-base border border-border-semantic text-text-semantic-primary placeholder:text-text-semantic-muted rounded-md focus:border-interactive-accent focus:outline-none w-full transition-colors duration-100';

const sizeClass = { sm: 'px-2 py-1 text-xs', md: 'px-2.5 py-1.5 text-sm' };

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ inputSize = 'md', error = false, className, ...rest }, ref) {
    const errorClass = error ? 'border-status-error' : '';
    const classes = `${BASE} ${sizeClass[inputSize]} ${errorClass} ${className ?? ''}`;
    return <input ref={ref} className={classes} {...rest} />;
  },
);
