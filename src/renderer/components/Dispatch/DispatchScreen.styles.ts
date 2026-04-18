/**
 * DispatchScreen.styles.ts — shared style constants for Dispatch components.
 * Uses design tokens only (var(--token-name)) — no hardcoded colors.
 */

import React from 'react';

// ── Layout ────────────────────────────────────────────────────────────────────

export const SCREEN_WRAPPER_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  backgroundColor: 'var(--surface-base)',
};

export const SCROLLABLE_BODY_STYLE: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '12px',
};

// ── Typography ────────────────────────────────────────────────────────────────

export const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '6px',
};

export const ERROR_TEXT_STYLE: React.CSSProperties = {
  fontSize: '12px',
  marginTop: '6px',
  padding: '6px 8px',
  borderRadius: '4px',
  border: '1px solid var(--status-error)',
  backgroundColor: 'var(--status-error-subtle)',
};

// ── Form elements ─────────────────────────────────────────────────────────────

export const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border-semantic)',
  backgroundColor: 'var(--surface-inset)',
  fontSize: '12px',
  color: 'var(--text-primary)',
  boxSizing: 'border-box',
  outline: 'none',
};

export const TEXTAREA_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  resize: 'vertical',
  minHeight: '100px',
  fontFamily: 'var(--font-mono, monospace)',
  lineHeight: 1.5,
};

export const SELECT_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  cursor: 'pointer',
};

export const FIELD_GROUP_STYLE: React.CSSProperties = {
  marginBottom: '12px',
};

// ── Buttons ───────────────────────────────────────────────────────────────────

export const PRIMARY_BUTTON_STYLE: React.CSSProperties = {
  padding: '7px 16px',
  borderRadius: '6px',
  border: 'none',
  backgroundColor: 'var(--interactive-accent)',
  color: 'var(--text-on-accent)',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  width: '100%',
  marginTop: '4px',
};

export const DANGER_BUTTON_STYLE: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: '4px',
  border: '1px solid var(--status-error)',
  backgroundColor: 'transparent',
  color: 'var(--status-error)',
  fontSize: '11px',
  cursor: 'pointer',
  flexShrink: 0,
};

export const GHOST_BUTTON_STYLE: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border-semantic)',
  backgroundColor: 'transparent',
  fontSize: '11px',
  cursor: 'pointer',
};

// ── Job card ──────────────────────────────────────────────────────────────────

export const JOB_CARD_STYLE: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--surface-panel)',
  marginBottom: '8px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
};

export const JOB_CARD_ACTIVE_STYLE: React.CSSProperties = {
  ...JOB_CARD_STYLE,
  borderColor: 'var(--interactive-accent)',
  backgroundColor: 'var(--interactive-accent-subtle)',
};

export const JOB_TITLE_STYLE: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const JOB_META_STYLE: React.CSSProperties = {
  fontSize: '10px',
  marginTop: '2px',
};

// ── Status pill ───────────────────────────────────────────────────────────────

export type DispatchJobStatus =
  | 'queued' | 'starting' | 'running' | 'completed' | 'failed' | 'canceled';

export function statusPillStyle(status: DispatchJobStatus): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: '10px',
    fontSize: '10px',
    fontWeight: 600,
    flexShrink: 0,
  };
  const colorMap: Record<DispatchJobStatus, React.CSSProperties> = {
    queued:    { backgroundColor: 'var(--status-info-subtle)',    color: 'var(--status-info)' },
    starting:  { backgroundColor: 'var(--status-warning-subtle)', color: 'var(--status-warning)' },
    running:   { backgroundColor: 'var(--status-warning-subtle)', color: 'var(--status-warning)' },
    completed: { backgroundColor: 'var(--status-success-subtle)', color: 'var(--status-success)' },
    failed:    { backgroundColor: 'var(--status-error-subtle)',   color: 'var(--status-error)' },
    canceled:  { backgroundColor: 'var(--surface-raised)',        color: 'var(--text-secondary)' },
  };
  return { ...base, ...colorMap[status] };
}

// ── Detail view ───────────────────────────────────────────────────────────────

export const DETAIL_FIELD_STYLE: React.CSSProperties = {
  marginBottom: '10px',
};

export const DETAIL_LABEL_STYLE: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '3px',
};

export const DETAIL_VALUE_STYLE: React.CSSProperties = {
  fontSize: '12px',
  padding: '4px 6px',
  backgroundColor: 'var(--surface-inset)',
  borderRadius: '4px',
  wordBreak: 'break-all',
};

export const STUB_NOTICE_STYLE: React.CSSProperties = {
  fontSize: '12px',
  padding: '10px',
  borderRadius: '4px',
  border: '1px dashed var(--border-subtle)',
  marginTop: '8px',
  textAlign: 'center',
};

// ── Tab switcher ──────────────────────────────────────────────────────────────

export const TAB_BAR_STYLE: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--border-subtle)',
  paddingLeft: '12px',
  flexShrink: 0,
};

export function tabButtonStyle(isActive: boolean): React.CSSProperties {
  return {
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: isActive ? 600 : 400,
    border: 'none',
    borderBottom: isActive ? '2px solid var(--interactive-accent)' : '2px solid transparent',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    color: isActive ? 'var(--interactive-accent)' : 'var(--text-secondary)',
    marginBottom: '-1px',
  };
}
