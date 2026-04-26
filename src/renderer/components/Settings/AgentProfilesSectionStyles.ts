/**
 * AgentProfilesSectionStyles.ts — Style constants for AgentProfilesSection components.
 */

import type React from 'react';

export const badgeStyle: React.CSSProperties = {
  fontSize: '10px',
  padding: '1px 6px',
  borderRadius: '4px',
  fontFamily: 'var(--font-mono)',
  whiteSpace: 'nowrap',
};

export const actionsStyle: React.CSSProperties = { display: 'flex', gap: '4px', flexShrink: 0 };

export const actionBtnStyle: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border-default)',
  background: 'transparent',
  fontSize: '11px',
  cursor: 'pointer',
};

export const deleteBtnStyle: React.CSSProperties = {
  ...actionBtnStyle,
  borderColor: 'var(--status-error)',
};

export const profileRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '9px 12px',
  gap: '10px',
  background: 'var(--surface-raised)',
};

export const nameStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '13px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
};

export const builtInLabelStyle: React.CSSProperties = { fontSize: '10px', fontStyle: 'italic' };

export const badgeRowStyle: React.CSSProperties = { display: 'flex', gap: '4px', flexShrink: 0 };

export const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)', // hardcoded: scrim overlay — opacity composite, not semantic color
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

export const modalCardStyle: React.CSSProperties = {
  width: '480px',
  padding: '20px',
  borderRadius: '10px',
  border: '1px solid var(--border-default)',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

export const modalDescStyle: React.CSSProperties = { fontSize: '12px' };

export const modalTextareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-base)',
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
  resize: 'vertical',
  outline: 'none',
};

export const modalFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
};

export const cancelBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'transparent',
  fontSize: '12px',
  cursor: 'pointer',
};

export function importBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    padding: '6px 14px',
    borderRadius: '6px',
    border: '1px solid var(--interactive-accent)',
    background: enabled ? 'var(--interactive-accent)' : 'var(--surface-raised)',
    color: enabled ? 'var(--text-on-accent)' : 'var(--text-muted)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: enabled ? 'pointer' : 'not-allowed',
  };
}
