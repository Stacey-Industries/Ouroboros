/**
 * appearanceThemeControlsStyles.ts — CSSProperties constants for
 * AppearanceSectionThemeControls.
 */

import type React from 'react';

export const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '12px',
};

export const panelStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: '8px',
  background: 'var(--surface-panel)',
  border: '1px solid var(--border-subtle)',
};

export const toggleButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '10px 14px',
  borderRadius: '8px',
  background: 'var(--surface-panel)',
  border: '1px solid var(--border-subtle)',
  cursor: 'pointer',
  textAlign: 'left',
};
