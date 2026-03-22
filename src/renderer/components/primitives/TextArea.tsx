import React from 'react';

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const BASE =
  'bg-surface-base border border-border-semantic text-text-semantic-primary placeholder:text-text-semantic-muted rounded-md focus:border-interactive-accent focus:outline-none w-full px-2.5 py-1.5 text-sm transition-colors duration-100 resize-y';

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea({ error = false, className, ...rest }, ref) {
    const errorClass = error ? 'border-status-error' : '';
    const classes = `${BASE} ${errorClass} ${className ?? ''}`;
    return <textarea ref={ref} className={classes} {...rest} />;
  },
);
