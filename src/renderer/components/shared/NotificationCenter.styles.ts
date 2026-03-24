import type React from 'react';

import type { ToastType } from '../../hooks/useToast';

export function getTypeColor(type: ToastType): string {
  switch (type) {
    case 'success':
      return 'var(--status-success)';
    case 'error':
      return 'var(--status-error)';
    case 'warning':
      return 'var(--status-warning)';
    default:
      return 'var(--interactive-accent)';
  }
}

export const NC_STYLES = `
@keyframes nc-fade-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
@keyframes nc-progress-pulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
`;

export const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(var(--titlebar-height, 36px) - 2px)',
  left: 0,
  width: '320px',
  maxHeight: '400px',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: '8px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
  zIndex: 9999,
  overflow: 'hidden',
  animation: 'nc-fade-in 150ms ease-out',
};

export const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  padding: '8px 12px',
  borderBottom: '1px solid color-mix(in srgb, var(--border-default) 40%, transparent)',
  fontSize: '12px',
  lineHeight: '1.4',
  fontFamily: 'var(--font-ui)',
};

export const timestampStyle: React.CSSProperties = {
  fontSize: '10px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  marginTop: '1px',
};

export const rowActionStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 4px',
  marginTop: '2px',
  border: 'none',
  borderRadius: '3px',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '11px',
  fontWeight: 600,
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
};

export const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  borderBottom: '1px solid var(--border-default)',
  fontFamily: 'var(--font-ui)',
};

export const headerLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

export const emptyStateStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '32px 16px',
  fontSize: '12px',
  fontFamily: 'var(--font-ui)',
  gap: '8px',
};

export const notificationIconWrapStyle: React.CSSProperties = { flexShrink: 0, marginTop: '2px' };
export const notificationBodyStyle: React.CSSProperties = { flex: 1, minWidth: 0 };
