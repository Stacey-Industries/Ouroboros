import type { CSSProperties } from 'react';

import { buttonStyle } from '../Settings/settingsStyles';

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
  border: '1px solid color-mix(in srgb, var(--interactive-accent) 40%, var(--border-default))',
  background: 'color-mix(in srgb, var(--interactive-accent) 8%, var(--surface-raised))',
  fontFamily: 'var(--font-mono)',
};

export const extensionsSectionActivationLabelStyle: CSSProperties = {
  fontSize: '11px',
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
};

export const extensionsSectionBadgeStripStyle: CSSProperties = {
  display: 'flex',
  gap: '4px',
  flexWrap: 'wrap',
};

export const extensionsSectionCommandIdStyle: CSSProperties = {
  fontSize: '0.75rem',
  fontFamily: 'var(--font-mono)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const extensionsSectionCommandLabelStyle: CSSProperties = {
  fontSize: '0.875rem',
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
    borderBottom: isLast ? 'none' : '1px solid var(--border-default)',
    background: 'var(--surface-raised)',
    gap: '12px',
  };
}

export const extensionsSectionCommandShortcutStyle: CSSProperties = {
  flexShrink: 0,
  padding: '2px 6px',
  borderRadius: '4px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-base)',
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-mono)',
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
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  paddingLeft: '16px',
};

export const extensionsSectionDetailHeaderStyle: CSSProperties = {
  padding: '10px 12px',
  background: 'var(--surface-panel)',
  borderBottom: '1px solid var(--border-default)',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

export const extensionsSectionDetailPanelStyle: CSSProperties = {
  marginTop: '12px',
  border: '1px solid var(--border-default)',
  borderRadius: '6px',
  overflow: 'hidden',
};

export const extensionsSectionDetailTitleStyle: CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
};

export const extensionsSectionDetailVersionStyle: CSSProperties = {
  fontWeight: 400,
};

export const extensionsSectionEmptyStateStyle: CSSProperties = {
  padding: '16px',
  borderRadius: '6px',
  border: '1px dashed var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
  fontStyle: 'italic',
  textAlign: 'center',
};

export const extensionsSectionErrorBannerStyle: CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid var(--status-error)',
  background: 'color-mix(in srgb, var(--status-error) 10%, var(--surface-panel))',
  fontSize: '12px',
};

export const extensionsSectionErrorLineStyle: CSSProperties = {
  fontSize: '11px',
  paddingLeft: '16px',
};

export const extensionsSectionErrorPanelStyle: CSSProperties = {
  padding: '12px',
  borderRadius: '6px',
  border: '1px solid var(--status-error)',
  background: 'color-mix(in srgb, var(--status-error) 10%, var(--surface-panel))',
  fontSize: '12px',
};

export const extensionsSectionExtensionNameStyle: CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const extensionsSectionItalicMutedTextStyle: CSSProperties = {
  fontStyle: 'italic',
};

export const extensionsSectionListContainerStyle: CSSProperties = {
  border: '1px solid var(--border-default)',
  borderRadius: '6px',
  overflow: 'hidden',
};

export const extensionsSectionLogBodyStyle: CSSProperties = {
  maxHeight: '160px',
  overflowY: 'auto',
  padding: '8px 12px',
  background: 'var(--surface-base)',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};

export const extensionsSectionLogHeaderStyle: CSSProperties = {
  padding: '8px 12px 4px',
  background: 'var(--surface-raised)',
  borderBottom: '1px solid var(--border-default)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

export const extensionsSectionLogTitleStyle: CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

export const extensionsSectionMutedTextStyle: CSSProperties = {
  fontSize: '12px',
};
