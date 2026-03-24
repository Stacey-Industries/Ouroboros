/**
 * fontSectionStyles.ts — CSSProperties constants for FontSection.
 */

import type React from 'react';

export const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '28px',
};
export const descriptionStyle: React.CSSProperties = { fontSize: '12px', marginBottom: '10px' };
export const sliderRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};
export const rangeInputStyle: React.CSSProperties = {
  flex: 1,
  accentColor: 'var(--interactive-accent)',
  cursor: 'pointer',
};
export const sizeValueStyle: React.CSSProperties = {
  minWidth: '36px',
  textAlign: 'right',
  fontSize: '13px',
  fontWeight: 600,
  fontFamily: 'var(--font-mono)',
};
export const previewBaseStyle: React.CSSProperties = {
  marginTop: '10px',
  padding: '10px 14px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
};
export const previewLabelStyle = (fontFamily = 'inherit'): React.CSSProperties => ({
  fontSize: '11px',
  marginBottom: '4px',
  fontFamily,
});
export const saveNoticeStyle: React.CSSProperties = { fontSize: '11px', marginTop: '6px' };
export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
};
export const resetButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '4px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border-default)',
  background: 'transparent',
  fontSize: '11px',
  cursor: 'pointer',
};
