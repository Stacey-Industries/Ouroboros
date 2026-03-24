/**
 * fileFilterSectionStyles.ts — CSSProperties constants for FileFilterSection.
 */

import type React from 'react';

export const stackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

export const helperTextStyle: React.CSSProperties = {
  fontSize: '12px',
  marginBottom: '10px',
};

export const tagListStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
};

export const tagStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  userSelect: 'none',
};

export const inputRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  marginBottom: '12px',
};

export const inputWrapperStyle: React.CSSProperties = {
  flex: 1,
  position: 'relative',
};

export const removeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '13px',
  lineHeight: 1,
  padding: '0',
  display: 'flex',
  alignItems: 'center',
};

export const addButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '7px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export const emptyStateStyle: React.CSSProperties = {
  fontSize: '12px',
  fontStyle: 'italic',
};

export function getInputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '7px 10px',
    borderRadius: '6px',
    border: hasError ? '1px solid var(--status-error, #e55)' : '1px solid var(--border-default)',
    background: 'var(--surface-base)',
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    boxSizing: 'border-box',
  };
}
