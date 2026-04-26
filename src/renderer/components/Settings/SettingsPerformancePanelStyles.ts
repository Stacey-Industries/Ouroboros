import React from 'react';

export const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};
export const descStyle: React.CSSProperties = { fontSize: '12px', lineHeight: 1.5, margin: '0 0 8px' };
export const hintStyle: React.CSSProperties = { fontSize: '12px', margin: 0 };
export const inlineLinkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  fontSize: '12px',
  textDecoration: 'underline',
};
export const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '12px',
};
export const cellStyle: React.CSSProperties = {
  padding: '5px 8px',
  borderBottom: '1px solid var(--border-subtle)',
};
export const thStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: '11px',
  textAlign: 'left',
};
export const totalRowStyle: React.CSSProperties = {
  borderTop: '2px solid var(--border-default)',
};
export const metricsGridStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};
export const metricRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  fontSize: '12px',
};
export const metricLabelStyle: React.CSSProperties = { fontSize: '12px' };
export const metricValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  fontVariantNumeric: 'tabular-nums',
};
export const updatedStyle: React.CSSProperties = { fontSize: '11px', margin: '4px 0 0' };
export const historyToggleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  textAlign: 'left',
};
export const chevronStyle: React.CSSProperties = { fontSize: '10px', marginLeft: '8px' };
