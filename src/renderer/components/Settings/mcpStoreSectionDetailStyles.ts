/**
 * mcpStoreSectionDetailStyles.ts — CSSProperties constants for McpStoreSectionDetail.
 */

import type React from 'react';

export const backButtonStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '4px 8px',
  border: 'none',
  background: 'transparent',
  fontSize: '12px',
  cursor: 'pointer',
  fontWeight: 500,
};
export const detailContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};
export const detailTitleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '10px',
};
export const detailTitleStyle: React.CSSProperties = { fontSize: '16px', fontWeight: 600 };
export const detailVersionStyle: React.CSSProperties = { fontSize: '12px' };
export const registryNameStyle: React.CSSProperties = {
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  marginTop: '2px',
};
export const detailDescriptionStyle: React.CSSProperties = {
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '8px 0 0 0',
};
export const metadataContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  marginTop: '12px',
  padding: '10px 12px',
  borderRadius: '6px',
  background: 'var(--surface-raised)',
  border: '1px solid var(--border-default)',
};
export const metadataRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  fontSize: '12px',
};
export const metadataLabelStyle: React.CSSProperties = { minWidth: '70px', fontWeight: 500 };
export const metadataValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
};
export const runtimeContainerStyle: React.CSSProperties = { marginTop: '12px' };
export const runtimeBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  padding: '8px 12px',
  borderRadius: '6px',
  background: 'var(--surface-raised)',
  border: '1px solid var(--border-default)',
};
export const monoLineStyle: React.CSSProperties = {
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
};
export const runtimeLabelStyle: React.CSSProperties = { fontWeight: 500 };
export const installAreaStyle: React.CSSProperties = { marginTop: '16px' };
export const alreadyInstalledStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '6px 12px',
  borderRadius: '6px',
  background: 'color-mix(in srgb, var(--interactive-accent) 15%, var(--surface-base))',
  fontSize: '12px',
  fontWeight: 600,
};
export const envVarContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '10px 12px',
  borderRadius: '6px',
  background: 'var(--surface-raised)',
  border: '1px solid var(--border-default)',
};
export const envVarRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
};
export const envVarLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  fontFamily: 'var(--font-mono)',
};
export const envVarDescStyle: React.CSSProperties = { fontSize: '11px', lineHeight: '1.4' };
export const envVarInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-panel)',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
  boxSizing: 'border-box',
};
