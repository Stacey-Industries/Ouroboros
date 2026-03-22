import React from 'react';

export function SectionLabel({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}): React.ReactElement {
  return (
    <div
      className={`text-text-semantic-muted${className ? ` ${className}` : ''}`}
      style={{
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: '8px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export const buttonStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '7px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  fontSize: '12px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export const smallButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  background: 'transparent',
  fontSize: '11px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
