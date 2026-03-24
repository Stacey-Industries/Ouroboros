/**
 * ThemeEditor.styles.ts — CSSProperties constants for ThemeEditor.parts.tsx.
 */

import type React from 'react';

export const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

export const ghostButtonStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: '5px',
  border: '1px solid var(--border-default)',
  background: 'transparent',
  fontSize: '11px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export const accentButtonStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: '5px',
  border: 'none',
  background: 'var(--interactive-accent)',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export const disabledButtonStyle: React.CSSProperties = {
  ...accentButtonStyle,
  background: 'var(--surface-raised)',
  cursor: 'not-allowed',
};

export const swatchPreviewStyle: React.CSSProperties = {
  width: '24px',
  height: '24px',
  borderRadius: '5px',
  border: '1px solid rgba(255,255,255,0.15)',
  cursor: 'pointer',
};

export const hiddenPickerStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  opacity: 0,
  width: '100%',
  height: '100%',
  cursor: 'pointer',
  padding: 0,
  margin: 0,
  border: 'none',
};
