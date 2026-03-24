export const MODEL_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
];

export const EFFORT_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
];

export const TEMPLATE_SELECT_STYLE = {
  flex: 1,
  minWidth: 0,
  background: 'var(--surface-base)',
  border: '1px solid var(--border-default)',
  borderRadius: '4px',
  padding: '3px 8px',
  fontSize: '11px',
  fontFamily: 'var(--font-ui)',
  cursor: 'pointer',
} as const;

export const OVERRIDE_SELECT_STYLE = {
  background: 'var(--surface-base)',
  border: '1px solid var(--border-default)',
  borderRadius: '3px',
  padding: '2px 6px',
  fontSize: '10px',
  fontFamily: 'var(--font-ui)',
  cursor: 'pointer',
} as const;

export const PROMPT_STYLE = {
  width: '100%',
  background: 'var(--surface-base)',
  border: '1px solid var(--border-default)',
  borderRadius: '4px',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  padding: '6px 8px',
  outline: 'none',
  resize: 'vertical',
  minHeight: '40px',
  lineHeight: 1.5,
  boxSizing: 'border-box',
} as const;
