import React from 'react';

const SUCCESS_STATUSES = new Set(['complete', 'passed', 'completed']);
const ERROR_STATUSES = new Set(['failed', 'cancelled']);
const ACTIVE_STATUSES = new Set(['awaiting_provider', 'applying', 'verifying', 'running', 'streaming']);

export function formatDateTime(value: number | undefined): string {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString();
}

export function formatNumber(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }

  return new Intl.NumberFormat().format(value);
}

export function formatPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export function badgeStyle(background: string, color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '999px',
    padding: '2px 8px',
    background,
    color,
    fontSize: '11px',
    fontWeight: 600,
    lineHeight: 1.6,
    whiteSpace: 'nowrap',
  };
}

export function resolveStatusTone(status: string | undefined): { background: string; color: string } {
  if (status && SUCCESS_STATUSES.has(status)) {
    return { background: 'var(--status-success-subtle)', color: 'var(--status-success)' };
  }

  if (status && ERROR_STATUSES.has(status)) {
    return { background: 'var(--status-error-subtle)', color: 'var(--status-error)' };
  }

  if (status && ACTIVE_STATUSES.has(status)) {
    return { background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)' };
  }

  return { background: 'color-mix(in srgb, var(--text-muted) 16%, transparent)', color: 'var(--text-muted)' };
}

export function panelStyle(background = 'var(--bg-secondary)'): React.CSSProperties {
  return {
    borderColor: 'var(--border)',
    background,
  };
}
