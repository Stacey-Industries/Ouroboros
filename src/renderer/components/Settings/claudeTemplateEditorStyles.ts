import type { CSSProperties } from 'react';

import { smallButtonStyle } from './settingsStyles';

export const claudeTemplateAddButtonStyle: CSSProperties = {
  padding: '6px 14px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'transparent',
  fontSize: '12px',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
};

export const claudeTemplateButtonRowStyle: CSSProperties = {
  display: 'flex',
  gap: '6px',
  justifyContent: 'flex-end',
};

export const claudeTemplateEditCardStyle: CSSProperties = {
  padding: '10px',
  borderRadius: '6px',
  border: '1px solid var(--interactive-accent)',
  background: 'var(--surface-raised)',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

export const claudeTemplateHeaderRowStyle: CSSProperties = {
  display: 'flex',
  gap: '6px',
};

export const claudeTemplateHelpCodeStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
};

export const claudeTemplateHelpTextStyle: CSSProperties = {
  fontSize: '12px',
  marginBottom: '12px',
};

export const claudeTemplateIconButtonStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '4px',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '4px',
};

export const claudeTemplateTextInputStyle: CSSProperties = {
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

export const claudeTemplateCancelButtonStyle: CSSProperties = {
  ...smallButtonStyle,
};

export const claudeTemplateIconInputStyle: CSSProperties = {
  ...claudeTemplateTextInputStyle,
  width: '50px',
  textAlign: 'center',
};

export const claudeTemplateIconPreviewStyle: CSSProperties = {
  fontSize: '14px',
  flexShrink: 0,
  width: '20px',
  textAlign: 'center',
};

export const claudeTemplateListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  marginBottom: '10px',
};

export const claudeTemplateSaveButtonStyle: CSSProperties = {
  ...smallButtonStyle,
  background: 'var(--interactive-accent)',
  borderColor: 'var(--interactive-accent)',
};

export const claudeTemplateTemplateNameStyle: CSSProperties = {
  fontSize: '12px',
  fontWeight: 500,
};

export const claudeTemplateTemplatePromptStyle: CSSProperties = {
  fontSize: '11px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const claudeTemplateTemplateRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
};

export const claudeTemplateTemplateTextStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
};

export const claudeTemplateTextareaStyle: CSSProperties = {
  ...claudeTemplateTextInputStyle,
  resize: 'vertical',
  minHeight: '60px',
  lineHeight: 1.5,
};
