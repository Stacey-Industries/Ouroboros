/**
 * providersSectionStyles.ts — CSSProperties for the Providers settings section.
 */

import type { CSSProperties } from 'react';

export const providersRootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

export const providerRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
};

export const providerNameStyle: CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--text)',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const providerUrlStyle: CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
  maxWidth: '200px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const providerBuiltInStyle: CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  fontStyle: 'italic',
};

export const providerListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

export const deleteButtonStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: '14px',
  lineHeight: 1,
  padding: '4px 6px',
  flexShrink: 0,
};

export const formContainerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '14px',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
};

export const formInputStyle: CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text)',
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
  boxSizing: 'border-box',
};

export const formSelectStyle: CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text)',
  fontSize: '12px',
  fontFamily: 'var(--font-ui)',
  outline: 'none',
  boxSizing: 'border-box',
  cursor: 'pointer',
};

export const formButtonRowStyle: CSSProperties = {
  display: 'flex',
  gap: '8px',
  marginTop: '4px',
};

export function formActionButtonStyle(primary: boolean): CSSProperties {
  return {
    padding: '7px 16px',
    borderRadius: '6px',
    border: primary ? '1px solid var(--accent)' : '1px solid var(--border)',
    background: primary ? 'var(--accent)' : 'transparent',
    color: primary ? 'var(--bg)' : 'var(--text)',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
  };
}

export const slotSelectStyle: CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text)',
  fontSize: '12px',
  fontFamily: 'var(--font-ui)',
  outline: 'none',
  boxSizing: 'border-box',
  cursor: 'pointer',
};

export const slotDescriptionStyle: CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  marginTop: '4px',
  lineHeight: 1.4,
};

export const slotSectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

export const headerDescriptionStyle: CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  margin: 0,
};

export const formLabelStyle: CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  marginBottom: '2px',
};
