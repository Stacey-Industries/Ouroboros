import React from 'react';

export const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};
export const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};
export const headerTextStyle: React.CSSProperties = { fontSize: '12px', margin: 0 };
export const rowStyle: React.CSSProperties = { display: 'flex', gap: '6px' };
export const categoryRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '6px',
  flexWrap: 'wrap',
};
export const listWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0px',
};
export const loadMoreWrapStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  marginTop: '12px',
};
export const listContainerStyle: React.CSSProperties = {
  border: '1px solid var(--border-default)',
  borderRadius: '6px',
  overflow: 'hidden',
};
export const installedBannerStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
};
export const installedBannerHeaderStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: '6px',
};
export const installedBannerBodyStyle: React.CSSProperties = {
  fontSize: '12px',
  lineHeight: '1.6',
};
export const installedSepStyle: React.CSSProperties = {};
export const installedNameStyle: React.CSSProperties = { cursor: 'pointer', fontWeight: 500 };
export const searchWrapperStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
};
export const searchIconStyle: React.CSSProperties = {
  position: 'absolute',
  left: '10px',
  fontSize: '14px',
  pointerEvents: 'none',
};
export const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px 8px 30px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-panel)',
  fontSize: '12px',
  outline: 'none',
  boxSizing: 'border-box',
};
export const emptyStyle: React.CSSProperties = {
  padding: '16px',
  borderRadius: '6px',
  border: '1px dashed var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
  fontStyle: 'italic',
  textAlign: 'center',
};
export const loadingStyle: React.CSSProperties = { fontSize: '12px' };
export const detailContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};
export const backButtonStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '4px 8px',
  border: 'none',
  background: 'transparent',
  fontSize: '12px',
  cursor: 'pointer',
  fontWeight: 500,
};
export const headerRowStyle: React.CSSProperties = {
  marginTop: '12px',
  display: 'flex',
  gap: '14px',
  alignItems: 'flex-start',
};
export const iconStyle: React.CSSProperties = {
  width: '48px',
  height: '48px',
  borderRadius: '8px',
  objectFit: 'cover',
  flexShrink: 0,
};
export const iconPlaceholderStyle: React.CSSProperties = {
  width: '48px',
  height: '48px',
  borderRadius: '8px',
  background: 'var(--surface-panel)',
  border: '1px solid var(--border-default)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '22px',
  flexShrink: 0,
};
export const detailTitleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '10px',
};
export const detailTitleStyle: React.CSSProperties = { fontSize: '16px', fontWeight: 600 };
export const detailVersionStyle: React.CSSProperties = { fontSize: '12px' };
export const publisherStyle: React.CSSProperties = {
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  marginTop: '2px',
};
export const detailDescriptionStyle: React.CSSProperties = {
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '8px 0 0 0',
};
export const statsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '16px',
  marginTop: '8px',
  paddingLeft: '62px',
};
export const statStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 500 };
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
export const metadataLabelStyle: React.CSSProperties = { minWidth: '80px', fontWeight: 500 };
export const metadataValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
};
export const linkStyle: React.CSSProperties = {
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  textDecoration: 'none',
  wordBreak: 'break-all',
};
export const contributionsContainerStyle: React.CSSProperties = { marginTop: '12px' };
export const contributionsBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  padding: '8px 12px',
  borderRadius: '6px',
  background: 'var(--surface-raised)',
  border: '1px solid var(--border-default)',
};
export const contributionItemStyle: React.CSSProperties = { fontSize: '12px' };
export const installAreaStyle: React.CSSProperties = { marginTop: '16px' };
export function accentButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '7px 14px',
    borderRadius: '6px',
    border: 'none',
    background: disabled ? 'var(--surface-raised)' : 'var(--interactive-accent)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-on-accent)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    whiteSpace: 'nowrap',
  };
}
export function categoryPillStyle(isActive: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: '12px',
    border: isActive ? '1px solid var(--interactive-accent)' : '1px solid var(--border-default)',
    background: isActive ? 'var(--interactive-accent)' : 'var(--surface-raised)',
    color: isActive ? 'var(--text-on-accent)' : 'var(--text-muted)',
    fontSize: '11px',
    fontWeight: isActive ? 600 : 400,
    cursor: 'pointer',
    transition: 'all 120ms ease',
    whiteSpace: 'nowrap',
  };
}
export const dangerButtonStyle: React.CSSProperties = {
  padding: '7px 14px',
  borderRadius: '6px',
  border: '1px solid var(--status-error)',
  background: 'color-mix(in srgb, var(--status-error) 10%, var(--surface-base))',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
export const readmeContainerStyle: React.CSSProperties = { marginTop: '16px' };
export const readmeBodyStyle: React.CSSProperties = {
  maxHeight: '400px',
  overflowY: 'auto',
  padding: '12px 14px',
  borderRadius: '6px',
  background: 'var(--surface-panel)',
  border: '1px solid var(--border-default)',
  fontSize: '13px',
  lineHeight: '1.6',
  fontFamily: 'var(--font-ui)',
  wordBreak: 'break-word',
};
export const errorBannerStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid var(--status-error)',
  background: 'color-mix(in srgb, var(--status-error) 10%, var(--surface-panel))',
  fontSize: '12px',
};
export const actionButtonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
};
