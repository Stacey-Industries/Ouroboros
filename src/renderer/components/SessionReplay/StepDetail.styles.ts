import type React from 'react';

export const SESSION_START_STYLE: React.CSSProperties = {
  padding: '12px',
  fontFamily: 'var(--font-ui)',
};

export const TOOL_DETAIL_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
};

export const TOOL_HEADER_STYLE: React.CSSProperties = { flexShrink: 0, padding: '8px 12px' };

export const TOOL_META_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginTop: '6px',
};

export const TOOL_BADGE_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2px 8px',
  borderRadius: '4px',
  fontSize: '0.75rem',
  fontWeight: 600,
  fontFamily: 'var(--font-mono)',
};

export const STATUS_TEXT_STYLE: React.CSSProperties = { fontSize: '0.6875rem', fontWeight: 500 };
export const META_TEXT_STYLE: React.CSSProperties = { fontSize: '0.6875rem' };

export const TOOL_INPUT_STYLE: React.CSSProperties = {
  marginTop: '6px',
  padding: '4px 8px',
  borderRadius: '4px',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-mono)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  maxHeight: '60px',
  overflow: 'auto',
};

export const OUTPUT_CONTAINER_STYLE: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

export const OUTPUT_LABEL_STYLE: React.CSSProperties = {
  padding: '0 12px 4px',
  fontSize: '0.6875rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

export const OUTPUT_PANEL_STYLE: React.CSSProperties = {
  flex: 1,
  margin: '0 12px 8px',
  padding: '8px',
  borderRadius: '4px',
  border: '1px solid var(--border-subtle)',
  overflow: 'auto',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-mono)',
  lineHeight: '1.5',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

export const EMPTY_OUTPUT_STYLE: React.CSSProperties = { fontStyle: 'italic' };

export const STEP_COUNTER_STYLE: React.CSSProperties = {
  fontSize: '0.625rem',
  fontWeight: 600,
  fontFamily: 'var(--font-mono)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

export const SESSION_TITLE_STYLE: React.CSSProperties = {
  margin: '8px 0 4px',
  fontSize: '0.875rem',
  fontWeight: 600,
};

export const SESSION_LABEL_STYLE: React.CSSProperties = {
  fontSize: '0.8125rem',
  marginBottom: '12px',
};

export const METADATA_GRID_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: '4px 12px',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-mono)',
};

export const METADATA_LABEL_STYLE: React.CSSProperties = { whiteSpace: 'nowrap' };
