import type React from 'react';

export const mutedStyle: React.CSSProperties = { fontSize: '12px' };

export const emptyStyle: React.CSSProperties = {
  padding: '16px',
  borderRadius: '6px',
  border: '1px dashed var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
  fontStyle: 'italic',
  textAlign: 'center',
};

export const listStyle: React.CSSProperties = {
  border: '1px solid var(--border-default)',
  borderRadius: '6px',
  overflow: 'hidden',
};

export const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  padding: '6px 10px',
  borderTop: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
};

export function rowStyle(isLast: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '10px 12px',
    gap: '12px',
    borderBottom: isLast ? 'none' : '1px solid var(--border-default)',
    background: 'var(--surface-panel)',
  };
}

export const nameRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

export const nameStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 600 };
export const versionStyle: React.CSSProperties = { fontSize: '11px' };

export const descStyle: React.CSSProperties = {
  fontSize: '11px',
  marginTop: '2px',
  lineHeight: 1.4,
};

export const contribStyle: React.CSSProperties = {
  fontSize: '10px',
  marginTop: '3px',
  fontStyle: 'italic',
};

export const controlsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '6px',
  flexShrink: 0,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
};

export const themeActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '6px',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
};

export const disabledBadgeStyle: React.CSSProperties = {
  fontSize: '9px',
  padding: '1px 5px',
  borderRadius: '3px',
  background: 'color-mix(in srgb, var(--text-muted) 20%, var(--surface-raised))',
  color: 'var(--text-muted)',
  fontWeight: 600,
  textTransform: 'uppercase',
};
