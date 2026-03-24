/**
 * contextDocsSectionStyles.ts — CSSProperties constants for ContextDocsSectionStatus.
 */

import type React from 'react';

import { buttonStyle } from './settingsStyles';

export const primaryButtonStyle: React.CSSProperties = {
  padding: '7px 14px',
  borderRadius: '6px',
  border: 'none',
  background: 'var(--interactive-accent)',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'opacity 0.15s ease',
};

export const disabledButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  opacity: 0.5,
  cursor: 'not-allowed',
};

export const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  transition: 'opacity 0.15s ease',
};

export const statusBoxStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
};

export const resultRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '4px 0',
  fontSize: '12px',
};

export const resultLabelStyle: React.CSSProperties = { fontWeight: 500 };

export const progressBarContainerStyle: React.CSSProperties = {
  width: '100%',
  height: '4px',
  borderRadius: '2px',
  background: 'var(--border-default)',
  overflow: 'hidden',
  marginTop: '8px',
};

export const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
};

export function progressBarFillStyle(percent: number): React.CSSProperties {
  return {
    width: `${percent}%`,
    height: '100%',
    borderRadius: '2px',
    background: 'var(--interactive-accent)',
    transition: 'width 0.3s ease',
  };
}
