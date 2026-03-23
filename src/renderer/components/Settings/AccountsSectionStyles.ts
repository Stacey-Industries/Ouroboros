/**
 * AccountsSectionStyles.ts — CSSProperties objects for the Accounts settings section.
 */

import type React from 'react';

export const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border-default)',
  borderRadius: '8px',
  padding: '16px',
  background: 'var(--surface-raised)',
};

export const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
};

export const providerNameStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
};

export const statusDotStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block',
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: color,
  marginRight: '6px',
});

export const statusTextStyle: React.CSSProperties = {
  fontSize: '12px',
  display: 'flex',
  alignItems: 'center',
};

export const userInfoStyle: React.CSSProperties = {
  fontSize: '12px',
  marginTop: '4px',
};

export const actionAreaStyle: React.CSSProperties = {
  marginTop: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-panel)',
  fontSize: '13px',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
  boxSizing: 'border-box',
};

export const inputRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
};

export const errorTextStyle: React.CSSProperties = {
  fontSize: '12px',
  marginTop: '4px',
};

export const deviceCodeStyle: React.CSSProperties = {
  fontSize: '24px',
  fontFamily: 'var(--font-mono)',
  fontWeight: 700,
  letterSpacing: '0.15em',
  padding: '12px 16px',
  borderRadius: '8px',
  border: '1px dashed var(--border-default)',
  background: 'var(--surface-panel)',
  textAlign: 'center',
  cursor: 'pointer',
  userSelect: 'all',
};

export const deviceCodeHintStyle: React.CSSProperties = {
  fontSize: '11px',
  textAlign: 'center',
  marginTop: '4px',
};

export const pollingTextStyle: React.CSSProperties = {
  fontSize: '12px',
  textAlign: 'center',
  marginTop: '8px',
};

export const bannerStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: '8px',
  border: '1px solid var(--interactive-accent)',
  background: 'color-mix(in srgb, var(--interactive-accent) 8%, var(--surface-panel))',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

export const bannerHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

export const bannerTitleStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
};

export const bannerActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
};

export const linkTextStyle: React.CSSProperties = {
  fontSize: '11px',
  cursor: 'pointer',
  textDecoration: 'underline',
  background: 'none',
  border: 'none',
  padding: 0,
};

export const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
};
