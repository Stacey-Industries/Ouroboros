/**
 * StagingArea.styles.ts — shared CSS and style constants for the StagingArea components.
 */

import type React from 'react';

export const STAGING_CSS = `
  .staging-file-row:hover { background-color: var(--surface-raised); }
  .staging-file-row:hover .staging-action-btn { opacity: 1 !important; }
  .staging-action-btn:hover { color: var(--interactive-accent) !important; }
  .staging-discard-btn:hover { color: var(--status-error) !important; }
`;

export const stagingSectionStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--border-subtle)',
};

export const stagingHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '4px 8px',
  gap: '4px',
  cursor: 'pointer',
  userSelect: 'none',
  borderBottom: '1px solid var(--border-subtle)',
  minHeight: '26px',
};

export const stagingHeaderTitleStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const stagingCountBadgeStyle: React.CSSProperties = {
  flexShrink: 0,
  fontSize: '0.625rem',
  fontWeight: 600,
  padding: '0 5px',
  borderRadius: '8px',
  lineHeight: '16px',
};

export const subHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '3px 8px 3px 12px',
  gap: '4px',
  cursor: 'pointer',
  userSelect: 'none',
  minHeight: '22px',
};

export const subHeaderTitleStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '0.6875rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
};

export const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  paddingLeft: '24px',
  paddingRight: '8px',
  cursor: 'pointer',
  height: '26px',
  boxSizing: 'border-box',
  userSelect: 'none',
};

export const fileNameStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-mono)',
};

export const actionBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  background: 'none',
  border: 'none',
  padding: '1px 3px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  borderRadius: '3px',
  opacity: 0,
  transition: 'opacity 150ms',
  fontSize: '0.75rem',
  fontWeight: 700,
  lineHeight: 1,
};

export const headerActionBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  background: 'none',
  border: 'none',
  padding: '1px 4px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  borderRadius: '3px',
  fontSize: '0.625rem',
  fontWeight: 600,
  letterSpacing: '0.02em',
  transition: 'color 150ms',
};
