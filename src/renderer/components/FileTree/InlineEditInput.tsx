/**
 * InlineEditInput — input field for inline rename / new file creation.
 *
 * Extracted from FileTreeItem.tsx.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';

/** Characters not allowed in file/folder names */
// eslint-disable-next-line no-control-regex
const INVALID_NAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/;

function validate(name: string): string | null {
  if (name.trim().length === 0) return 'Name cannot be empty';
  if (INVALID_NAME_CHARS.test(name)) return 'Name contains invalid characters';
  if (name === '.' || name === '..') return 'Invalid name';
  return null;
}

export interface InlineEditInputProps {
  initialValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function InlineEditInput({
  initialValue,
  onConfirm,
  onCancel,
}: InlineEditInputProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.focus();
    const dotIndex = initialValue.lastIndexOf('.');
    if (dotIndex > 0) {
      inputRef.current.setSelectionRange(0, dotIndex);
    } else {
      inputRef.current.select();
    }
  }, [initialValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        const err = validate(value);
        if (err) { setError(err); return; }
        onConfirm(value.trim());
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [value, onConfirm, onCancel]
  );

  const handleBlur = useCallback(() => {
    const err = validate(value);
    if (err || value.trim() === initialValue) {
      onCancel();
    } else {
      onConfirm(value.trim());
    }
  }, [value, initialValue, onConfirm, onCancel]);

  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(null); }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{
          width: '100%',
          padding: '0 4px',
          background: 'var(--bg)',
          border: error ? '1px solid var(--error, #e55)' : '1px solid var(--accent)',
          borderRadius: '2px',
          color: 'var(--text)',
          fontSize: '0.8125rem',
          fontFamily: 'var(--font-mono)',
          outline: 'none',
          boxSizing: 'border-box',
          height: '20px',
          lineHeight: '20px',
        }}
      />
      {error && <EditError message={error} />}
    </div>
  );
}

function EditError({ message }: { message: string }): React.ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        top: '22px',
        left: 0,
        right: 0,
        padding: '2px 6px',
        background: 'var(--bg-secondary, var(--bg))',
        border: '1px solid var(--error, #e55)',
        borderRadius: '2px',
        color: 'var(--error, #e55)',
        fontSize: '0.6875rem',
        fontFamily: 'var(--font-ui)',
        zIndex: 10,
        whiteSpace: 'nowrap',
      }}
    >
      {message}
    </div>
  );
}
