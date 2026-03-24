/**
 * extensionsSectionStyles2.ts — CSSProperties (P–V) for ExtensionsInstalledSection.
 * Split from extensionsSectionStyles.ts to stay under 300 lines.
 */

import type { CSSProperties } from 'react';

import { smallButtonStyle } from './settingsStyles';

const STATUS_COLORS = {
  active: '#4ade80',
  error: '#f87171',
  inactive: 'var(--text-muted)',
  pending: '#facc15',
} as const;

export const extensionsSectionPermissionBadgeStyle: CSSProperties = {
  fontSize: '10px',
  padding: '1px 6px',
  borderRadius: '3px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontFamily: 'var(--font-mono)',
};

export const extensionsSectionRefreshButtonStyle: CSSProperties = {
  ...smallButtonStyle,
  fontSize: '10px',
  padding: '2px 6px',
};

export function extensionsSectionRowStyle(isSelected: boolean, isLast: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: isLast ? 'none' : '1px solid var(--border-default)',
    background: isSelected
      ? 'color-mix(in srgb, var(--interactive-accent) 8%, var(--surface-raised))'
      : 'var(--surface-raised)',
    gap: '12px',
    cursor: 'pointer',
    transition: 'background 120ms ease',
  };
}

export const extensionsSectionRootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

export function extensionsSectionStatusBadgeStyle(
  status: keyof typeof STATUS_COLORS,
): CSSProperties {
  return {
    fontSize: '10px',
    padding: '1px 5px',
    borderRadius: '3px',
    border: `1px solid ${STATUS_COLORS[status]}`,
    color: STATUS_COLORS[status],
    fontWeight: 500,
    flexShrink: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };
}

export function extensionsSectionStatusDotStyle(status: keyof typeof STATUS_COLORS): CSSProperties {
  return {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: STATUS_COLORS[status],
    flexShrink: 0,
  };
}

export const extensionsSectionSummaryColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  minWidth: 0,
  flex: 1,
};

export const extensionsSectionSummaryHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

export function extensionsSectionToggleButtonStyle(enabled: boolean): CSSProperties {
  return {
    ...smallButtonStyle,
    background: enabled
      ? 'color-mix(in srgb, var(--interactive-accent) 15%, var(--surface-base))'
      : 'var(--surface-base)',
    color: enabled ? 'var(--interactive-accent)' : 'var(--text-muted)',
  };
}

export const extensionsSectionVersionStyle: CSSProperties = {
  fontSize: '11px',
  flexShrink: 0,
};
