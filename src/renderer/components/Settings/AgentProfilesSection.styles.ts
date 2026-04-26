import type React from 'react';

export const wrapStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '16px' };

export const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

export const headerActionsStyle: React.CSSProperties = { display: 'flex', gap: '8px' };

export const headerBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: '5px',
  border: '1px solid var(--border-default)',
  background: 'transparent',
  fontSize: '12px',
  cursor: 'pointer',
};

export const listStyle: React.CSSProperties = {
  border: '1px solid var(--border-default)',
  borderRadius: '6px',
  overflow: 'hidden',
};

export const emptyStyle: React.CSSProperties = { fontSize: '12px', fontStyle: 'italic' };

export const toastStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
};

export const pickerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

export const pickerLabelStyle: React.CSSProperties = { fontSize: '12px', flexShrink: 0 };

export const selectStyle: React.CSSProperties = {
  flex: 1,
  padding: '5px 8px',
  borderRadius: '5px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
};

export const noProjectStyle: React.CSSProperties = { fontSize: '12px', fontStyle: 'italic' };
