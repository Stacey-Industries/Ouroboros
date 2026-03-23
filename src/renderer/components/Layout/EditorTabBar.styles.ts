/**
 * EditorTabBar style constants — extracted to keep EditorTabBar.tsx under 300 lines.
 */

import type React from 'react';

export const containerStyle: React.CSSProperties = {
  display: 'flex', flex: 1, height: '100%', alignItems: 'stretch',
};

export const spacerStyle: React.CSSProperties = { flex: 1 };

export const splitButtonStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '28px', height: '100%', flexShrink: 0, border: 'none',
  background: 'transparent', color: 'var(--text-faint, var(--text-secondary))',
  cursor: 'pointer', padding: 0,
  transition: 'color 150ms ease, background-color 150ms ease',
};

export const splitButtonActiveStyle: React.CSSProperties = {
  ...splitButtonStyle, color: 'var(--interactive-accent)',
};

export const multiBufferTabStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px', padding: '0 10px 0 12px',
  height: '100%', flexShrink: 0, cursor: 'pointer', userSelect: 'none',
  borderRight: '1px solid var(--border-semantic)', borderBottom: '2px solid transparent',
  backgroundColor: 'var(--surface-panel)', color: 'var(--text-secondary)',
  fontSize: '0.8125rem', fontFamily: 'var(--font-ui)', fontStyle: 'italic',
  minWidth: '80px', maxWidth: '200px',
  transition: 'background-color 150ms ease, color 150ms ease',
};

export const multiBufferTabActiveStyle: React.CSSProperties = {
  ...multiBufferTabStyle, backgroundColor: 'var(--surface-base)',
  color: 'var(--text-primary)', borderBottom: '2px solid var(--interactive-accent)',
};

export const multiBufferIconStyle: React.CSSProperties = { fontSize: '0.75rem', opacity: 0.6 };

export const multiBufferLabelStyle: React.CSSProperties = {
  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

export const renameInputStyle: React.CSSProperties = {
  flex: 1, background: 'var(--surface-base)', border: '1px solid var(--interactive-accent)',
  borderRadius: '2px', color: 'var(--text-primary)', fontSize: '0.8125rem',
  fontFamily: 'var(--font-ui)', fontStyle: 'italic', padding: '0 4px',
  outline: 'none', minWidth: 0,
};

export const excerptCountStyle: React.CSSProperties = {
  fontSize: '0.625rem', color: 'var(--text-faint, var(--text-secondary))',
  fontStyle: 'normal', whiteSpace: 'nowrap',
};

export const closeButtonStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '16px', height: '16px', borderRadius: '3px', border: 'none',
  background: 'transparent', color: 'var(--text-faint, var(--text-secondary))',
  cursor: 'pointer', padding: 0, flexShrink: 0,
};

export const newMultiBufferButtonStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '28px', height: '100%', flexShrink: 0, border: 'none',
  background: 'transparent', color: 'var(--text-faint, var(--text-secondary))',
  cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'var(--font-ui)',
  padding: 0, borderRight: '1px solid var(--border-semantic)',
};

export const specialViewTabStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px', padding: '0 10px 0 12px',
  height: '100%', flexShrink: 0, cursor: 'pointer', userSelect: 'none',
  borderRight: '1px solid var(--border-semantic)', borderBottom: '2px solid transparent',
  backgroundColor: 'var(--surface-panel)', color: 'var(--text-secondary)',
  fontSize: '0.8125rem', fontFamily: 'var(--font-ui)',
  minWidth: '80px', maxWidth: '200px',
  transition: 'background-color 150ms ease, color 150ms ease',
};

export const specialViewTabActiveStyle: React.CSSProperties = {
  ...specialViewTabStyle, backgroundColor: 'var(--surface-base)',
  color: 'var(--text-primary)', borderBottom: '2px solid var(--interactive-accent)',
};

export const specialViewIconStyle: React.CSSProperties = { fontSize: '0.875rem', opacity: 0.7 };

export const specialViewCloseStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '18px', height: '18px', marginLeft: '4px',
  borderRadius: '4px', border: 'none', background: 'transparent',
  color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer',
  lineHeight: 1, flexShrink: 0,
};
