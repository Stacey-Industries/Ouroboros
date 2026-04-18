import React from 'react';

const wrapperStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: 'var(--surface-base)',
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  resize: 'none',
  border: 'none',
  outline: 'none',
  padding: '12px 16px',
  fontFamily: 'var(--font-mono)',
  // 16px prevents iOS Safari from auto-zooming on textarea focus (mobile.css:200-205)
  fontSize: '16px',
  lineHeight: 1.6,
  background: 'var(--surface-base)',
  color: 'var(--text-semantic-primary)',
  overflowY: 'auto',
};

const chipStyle: React.CSSProperties = {
  padding: '3px 10px',
  fontSize: '11px',
  borderTop: '1px solid var(--border-subtle)',
  background: 'var(--surface-inset)',
  color: 'var(--text-semantic-muted)',
  flexShrink: 0,
};

export interface MonacoMobileEditableProps {
  content: string;
  onChange?: (value: string) => void;
}

/**
 * Editable mobile fallback — plain <textarea> with monospace font.
 * font-size:16px is required to suppress iOS auto-zoom on focus.
 * A subtle info chip below the editor notes that syntax highlighting
 * is unavailable in phone edit mode.
 */
export function MonacoMobileEditable({
  content,
  onChange,
}: MonacoMobileEditableProps): React.ReactElement {
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>): void {
    onChange?.(e.target.value);
  }

  return (
    <div style={wrapperStyle}>
      <textarea
        style={textareaStyle}
        value={content}
        onChange={handleChange}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        data-monaco-fallback="editable"
      />
      <div style={chipStyle}>
        Phone edit mode — syntax highlighting disabled
      </div>
    </div>
  );
}
