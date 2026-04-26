import React from 'react';

export const categoryLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '4px',
};

export const scopeToggleStyle: React.CSSProperties = {
  display: 'inline-flex',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  overflow: 'hidden',
};

export const eventSectionStyle: React.CSSProperties = {
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  marginBottom: '6px',
  overflow: 'hidden',
};

export const eventBodyStyle: React.CSSProperties = {
  padding: '8px 12px 10px',
  background: 'var(--surface-base)',
  borderTop: '1px solid var(--border-default)',
};

export const hookRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '4px 0',
};

export const hookCmdStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const removeBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '2px 6px',
  borderRadius: '4px',
  border: '1px solid var(--border-default)',
  background: 'transparent',
  color: 'var(--text-muted)',
  fontSize: '11px',
  cursor: 'pointer',
};

export const addInputStyle: React.CSSProperties = {
  flex: 1,
  padding: '5px 8px',
  borderRadius: '5px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
};

export const eventHeaderStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  padding: '8px 12px',
  background: 'var(--surface-raised)',
  border: 'none',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--text-primary)',
};

export function scopeButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 14px',
    background: active ? 'var(--interactive-accent)' : 'transparent',
    color: active ? 'var(--text-on-accent)' : 'var(--text-muted)',
    border: 'none',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
    transition: 'all 0.15s',
  };
}

export function addBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '5px 12px',
    borderRadius: '5px',
    border: '1px solid var(--border-default)',
    background: 'var(--surface-raised)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
    fontSize: '12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
