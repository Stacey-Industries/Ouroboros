import type { CSSProperties } from 'react';

export const claudeSectionAddDirectoryRowStyle: CSSProperties = {
  display: 'flex',
  gap: '6px',
};

export const claudeSectionBudgetInputStyle: CSSProperties = {
  width: '120px',
  padding: '7px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '13px',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
};

export const claudeSectionDangerCopyStyle: CSSProperties = {
  flex: 1,
  marginRight: '16px',
};

export const claudeSectionDangerRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: '8px',
};

export const claudeSectionDangerSectionStyle: CSSProperties = {
  marginTop: '8px',
  padding: '16px',
  borderRadius: '8px',
  border: '1px solid rgba(239, 68, 68, 0.3)',
  background: 'rgba(239, 68, 68, 0.05)',
};

export const claudeSectionDangerTextStyle: CSSProperties = {
  fontSize: '12px',
  margin: 0,
  lineHeight: 1.4,
};

export const claudeSectionDangerTitleStyle: CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  marginBottom: '4px',
};

export const claudeSectionDirectoryListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  marginBottom: '8px',
};

export const claudeSectionDirectoryRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 10px',
  borderRadius: '4px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
};

export const claudeSectionDirectoryTextStyle: CSSProperties = {
  flex: 1,
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export function claudeSectionEffortButtonStyle(isActive: boolean): CSSProperties {
  return {
    padding: '4px 12px',
    borderRadius: '4px',
    border: isActive ? '1px solid var(--interactive-accent)' : '1px solid var(--border-default)',
    background: isActive ? 'var(--interactive-accent)' : 'transparent',
    color: isActive ? 'var(--text-on-accent)' : 'var(--text-primary)',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
    transition: 'all 0.1s',
  };
}

export const claudeSectionEffortListStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
};

export const claudeSectionHeaderTextStyle: CSSProperties = {
  fontSize: '12px',
  margin: 0,
};

export const claudeSectionInlineDescriptionStyle: CSSProperties = {
  fontSize: '12px',
  margin: 0,
};

export const claudeSectionModelHelpStyle: CSSProperties = {
  fontSize: '11px',
  marginTop: '6px',
  fontFamily: 'var(--font-mono)',
};

export const claudeSectionRemoveDirectoryButtonStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '14px',
  lineHeight: 1,
  padding: '2px 4px',
  flexShrink: 0,
};

export const claudeSectionRootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

export const claudeSectionSectionDescriptionStyle: CSSProperties = {
  fontSize: '12px',
  marginBottom: '10px',
};

export const claudeSectionSelectStyle: CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
  fontFamily: 'var(--font-ui)',
  outline: 'none',
  boxSizing: 'border-box',
  cursor: 'pointer',
};

export function claudeSectionSwitchThumbStyle(checked: boolean): CSSProperties {
  return {
    position: 'absolute',
    top: '2px',
    left: checked ? '20px' : '2px',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: checked ? '#fff' : 'var(--text-muted)',
    transition: 'left 0.15s ease, background 0.15s ease',
  };
}

export function claudeSectionSwitchTrackStyle(
  checked: boolean,
  activeColor: string,
): CSSProperties {
  return {
    position: 'relative',
    width: '40px',
    height: '22px',
    borderRadius: '11px',
    border: 'none',
    background: checked ? activeColor : 'var(--surface-raised)',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
    transition: 'background 0.15s ease',
    boxShadow: `inset 0 0 0 1px ${checked ? 'transparent' : 'var(--border-default)'}`,
  };
}

export const claudeSectionTextInputStyle: CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
  boxSizing: 'border-box',
};

export const claudeSectionTextareaStyle: CSSProperties = {
  ...claudeSectionTextInputStyle,
  resize: 'vertical',
  minHeight: '80px',
  lineHeight: 1.5,
};

export const claudeSectionToggleRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

export function claudeSectionAddButtonStyle(enabled: boolean): CSSProperties {
  return {
    padding: '7px 14px',
    borderRadius: '6px',
    border: '1px solid var(--border-default)',
    background: enabled ? 'var(--interactive-accent)' : 'var(--surface-raised)',
    color: enabled ? 'var(--text-on-accent)' : 'var(--text-muted)',
    fontSize: '12px',
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontWeight: 500,
    flexShrink: 0,
  };
}
