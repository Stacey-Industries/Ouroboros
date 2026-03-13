import type { CSSProperties } from 'react';
import { buttonStyle, smallButtonStyle } from './settingsStyles';

const STATUS_COLORS = {
  active: '#4ade80',
  error: '#f87171',
  inactive: 'var(--text-muted)',
  pending: '#facc15',
} as const;

export function extensionsSectionActionButtonStyle(disabled: boolean): CSSProperties {
  return {
    ...buttonStyle,
    opacity: disabled ? 0.6 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

export const extensionsSectionActionRowStyle: CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
};

export const extensionsSectionActivationBadgeStyle: CSSProperties = {
  fontSize: '10px',
  padding: '1px 6px',
  borderRadius: '3px',
  border: '1px solid color-mix(in srgb, var(--accent) 40%, var(--border))',
  background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-tertiary))',
  color: 'var(--accent)',
  fontFamily: 'var(--font-mono)',
};

export const extensionsSectionActivationLabelStyle: CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  fontWeight: 500,
};

export const extensionsSectionActivationRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexWrap: 'wrap',
};

export const extensionsSectionAuthorStyle: CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
};

export const extensionsSectionBadgeStripStyle: CSSProperties = {
  display: 'flex',
  gap: '4px',
  flexWrap: 'wrap',
};

export const extensionsSectionCommandIdStyle: CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const extensionsSectionCommandLabelStyle: CSSProperties = {
  fontSize: '0.875rem',
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export function extensionsSectionCommandRowStyle(isLast: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: isLast ? 'none' : '1px solid var(--border)',
    background: 'var(--bg-tertiary)',
    gap: '12px',
  };
}

export const extensionsSectionCommandShortcutStyle: CSSProperties = {
  flexShrink: 0,
  padding: '2px 6px',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
};

export const extensionsSectionCommandTextStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
};

export const extensionsSectionControlRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexShrink: 0,
};

export const extensionsSectionDescriptionStyle: CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  paddingLeft: '16px',
};

export const extensionsSectionDetailHeaderStyle: CSSProperties = {
  padding: '10px 12px',
  background: 'var(--bg-secondary)',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

export const extensionsSectionDetailPanelStyle: CSSProperties = {
  marginTop: '12px',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  overflow: 'hidden',
};

export const extensionsSectionDetailTitleStyle: CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text)',
};

export const extensionsSectionDetailVersionStyle: CSSProperties = {
  fontWeight: 400,
  color: 'var(--text-muted)',
};

export const extensionsSectionEmptyStateStyle: CSSProperties = {
  padding: '16px',
  borderRadius: '6px',
  border: '1px dashed var(--border)',
  background: 'var(--bg-tertiary)',
  fontSize: '12px',
  color: 'var(--text-muted)',
  fontStyle: 'italic',
  textAlign: 'center',
};

export const extensionsSectionErrorBannerStyle: CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid var(--error)',
  background: 'color-mix(in srgb, var(--error) 10%, var(--bg-secondary))',
  fontSize: '12px',
  color: 'var(--error)',
};

export const extensionsSectionErrorLineStyle: CSSProperties = {
  fontSize: '11px',
  color: '#f87171',
  paddingLeft: '16px',
};

export const extensionsSectionErrorPanelStyle: CSSProperties = {
  padding: '12px',
  borderRadius: '6px',
  border: '1px solid var(--error)',
  background: 'color-mix(in srgb, var(--error) 10%, var(--bg-secondary))',
  fontSize: '12px',
  color: 'var(--error)',
};

export const extensionsSectionExtensionNameStyle: CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const extensionsSectionItalicMutedTextStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontStyle: 'italic',
};

export const extensionsSectionListContainerStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '6px',
  overflow: 'hidden',
};

export const extensionsSectionLogBodyStyle: CSSProperties = {
  maxHeight: '160px',
  overflowY: 'auto',
  padding: '8px 12px',
  background: 'var(--bg)',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  lineHeight: 1.5,
  color: 'var(--text-secondary)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};

export const extensionsSectionLogHeaderStyle: CSSProperties = {
  padding: '8px 12px 4px',
  background: 'var(--bg-tertiary)',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

export const extensionsSectionLogTitleStyle: CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
};

export const extensionsSectionMutedTextStyle: CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
};

export const extensionsSectionPermissionBadgeStyle: CSSProperties = {
  fontSize: '10px',
  padding: '1px 6px',
  borderRadius: '3px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
};

export const extensionsSectionRefreshButtonStyle: CSSProperties = {
  ...smallButtonStyle,
  fontSize: '10px',
  padding: '2px 6px',
};

export function extensionsSectionRowStyle(
  isSelected: boolean,
  isLast: boolean,
): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: isLast ? 'none' : '1px solid var(--border)',
    background: isSelected
      ? 'color-mix(in srgb, var(--accent) 8%, var(--bg-tertiary))'
      : 'var(--bg-tertiary)',
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

export function extensionsSectionStatusDotStyle(
  status: keyof typeof STATUS_COLORS,
): CSSProperties {
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
      ? 'color-mix(in srgb, var(--accent) 15%, var(--bg))'
      : 'var(--bg)',
    color: enabled ? 'var(--accent)' : 'var(--text-muted)',
  };
}

export const extensionsSectionVersionStyle: CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  flexShrink: 0,
};
