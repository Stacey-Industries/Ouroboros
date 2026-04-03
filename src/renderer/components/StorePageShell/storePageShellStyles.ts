/**
 * storePageShellStyles.ts — Shared styles for store page tab bar and layout.
 */

import type React from 'react';

export const shellRootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  fontFamily: 'var(--font-ui)',
};

export const shellHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px 0 16px',
  flexShrink: 0,
};

export const shellTitleStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  margin: 0,
};

export const shellSubtitleStyle: React.CSSProperties = {
  fontSize: '11px',
  margin: 0,
};

export const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0',
  padding: '8px 16px 0 16px',
  borderBottom: '1px solid var(--border-default)',
  flexShrink: 0,
};

export function tabStyle(isActive: boolean): React.CSSProperties {
  return {
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: isActive ? 600 : 400,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottom: isActive
      ? '2px solid var(--interactive-accent)'
      : '2px solid transparent',
    transition: 'all 120ms ease',
    whiteSpace: 'nowrap',
  };
}

export const refreshButtonStyle: React.CSSProperties = {
  padding: '4px 12px',
  borderRadius: '4px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
  cursor: 'pointer',
  flexShrink: 0,
};

export const contentScrollStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '16px',
};
