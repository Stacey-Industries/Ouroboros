import type React from 'react';

export const BUTTON_BASE_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '8px 12px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-ui)',
  textAlign: 'left',
};

export const RECENT_BUTTON_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  width: '100%',
  padding: '6px 12px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-ui)',
  textAlign: 'left',
  overflow: 'hidden',
};

export const TOGGLE_BUTTON_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  width: '100%',
  padding: '0 4px',
  background: 'transparent',
  border: 'none',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-ui)',
  fontWeight: 500,
  overflow: 'hidden',
  minWidth: 0,
};

export const MENU_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  zIndex: 1000,
  borderRadius: '6px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
  overflow: 'hidden',
  marginTop: '4px',
};

export const TRUNCATE_STYLE: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  width: '100%',
};

export const RECENT_PATH_STYLE: React.CSSProperties = {
  ...TRUNCATE_STYLE,
  fontSize: '0.6875rem',
};

export const SECTION_LABEL_STYLE: React.CSSProperties = {
  padding: '4px 12px 2px',
  fontSize: '0.6875rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};
