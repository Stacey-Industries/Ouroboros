import React, { memo } from 'react';

export interface ToolbarButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
}

const baseStyle: React.CSSProperties = {
  padding: '2px 8px',
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-ui)',
  fontWeight: 500,
  borderRadius: '4px',
  cursor: 'pointer',
  lineHeight: '1.5',
};

/**
 * Reusable toggle button for the FileViewer toolbar.
 * Renders an active (accent-colored) or inactive (transparent) state.
 */
export const ToolbarButton = memo(function ToolbarButton({
  label,
  active,
  onClick,
  title,
}: ToolbarButtonProps): React.ReactElement {
  const style: React.CSSProperties = {
    ...baseStyle,
    border: '1px solid',
    borderColor: active ? 'var(--interactive-accent)' : 'var(--border-semantic)',
    backgroundColor: active ? 'var(--interactive-accent)' : 'transparent',
    color: active ? 'var(--text-on-accent)' : 'var(--text-muted)',
  };

  return (
    <button onClick={onClick} title={title} style={style}>
      {label}
    </button>
  );
});
