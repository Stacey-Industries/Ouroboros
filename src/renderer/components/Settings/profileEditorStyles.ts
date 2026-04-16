/**
 * profileEditorStyles.ts — Inline style constants for ProfileEditor.tsx.
 */

import type React from 'react';

export const editorWrapStyle: React.CSSProperties = {
  padding: '16px',
  border: '1px solid var(--border-default)',
  borderRadius: '8px',
  background: 'var(--surface-raised)',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

export const editorTitleStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  marginBottom: '4px',
};

export const errorStyle: React.CSSProperties = {
  fontSize: '12px',
  padding: '8px 10px',
  borderRadius: '6px',
  background: 'color-mix(in srgb, var(--status-error) 10%, var(--surface-panel))',
  border: '1px solid var(--status-error)',
};

export const fieldRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
};

export const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  width: '90px',
  flexShrink: 0,
  paddingTop: '6px',
};

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-base)',
  fontSize: '12px',
  fontFamily: 'var(--font-ui)',
  outline: 'none',
};

export const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  fontFamily: 'var(--font-mono)',
};

export const segmentedWrapStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
};

export const segmentBase: React.CSSProperties = {
  padding: '4px 12px',
  borderRadius: '5px',
  fontSize: '12px',
  cursor: 'pointer',
  border: '1px solid var(--border-default)',
  background: 'transparent',
};

export const segmentStyle: React.CSSProperties = segmentBase;

export const segmentActiveStyle: React.CSSProperties = {
  ...segmentBase,
  background: 'var(--interactive-accent)',
  borderColor: 'var(--interactive-accent)',
  color: 'var(--text-on-accent)',
};

export const checklistWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px 16px',
};

export const checkItemStyle: React.CSSProperties = {
  fontSize: '12px',
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
};

export const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
  paddingTop: '4px',
};

export const cancelBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'transparent',
  fontSize: '12px',
  cursor: 'pointer',
};

export function saveBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    padding: '6px 14px',
    borderRadius: '6px',
    border: '1px solid var(--interactive-accent)',
    background: enabled ? 'var(--interactive-accent)' : 'var(--surface-raised)',
    color: enabled ? 'var(--text-on-accent)' : 'var(--text-muted)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: enabled ? 'pointer' : 'not-allowed',
  };
}
