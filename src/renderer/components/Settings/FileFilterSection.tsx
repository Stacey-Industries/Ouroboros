import React, { useState, useCallback, useRef } from 'react';
import type { AppConfig } from '../../types/electron';

interface FileFilterSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

/** Hardcoded patterns — shown as read-only reference */
const BASELINE_PATTERNS = ['.git', 'node_modules', 'dist', 'out', '__pycache__', '.*'];

/**
 * FileFilterSection — configure custom ignore patterns for the file tree.
 */
export function FileFilterSection({
  draft,
  onChange,
}: FileFilterSectionProps): React.ReactElement {
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const patterns: string[] = draft.fileTreeIgnorePatterns ?? [];

  const validate = useCallback((value: string): string | null => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return 'Pattern cannot be empty';
    if (trimmed.includes('/') || trimmed.includes('\\')) {
      return 'Use bare names only (e.g. vendor or *.log), not paths';
    }
    if (patterns.includes(trimmed)) return 'Pattern already exists';
    return null;
  }, [patterns]);

  const handleAdd = useCallback(() => {
    const trimmed = inputValue.trim();
    const error = validate(trimmed);
    if (error) {
      setInputError(error);
      return;
    }
    onChange('fileTreeIgnorePatterns', [...patterns, trimmed]);
    setInputValue('');
    setInputError(null);
    inputRef.current?.focus();
  }, [inputValue, validate, patterns, onChange]);

  const handleRemove = useCallback(
    (pattern: string) => {
      onChange('fileTreeIgnorePatterns', patterns.filter((p) => p !== pattern));
    },
    [patterns, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Baseline patterns — informational */}
      <section>
        <SectionLabel>Always Ignored (built-in)</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          These patterns are always active and cannot be removed.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {BASELINE_PATTERNS.map((p) => (
            <Tag key={p} label={p} removable={false} />
          ))}
        </div>
      </section>

      {/* Custom patterns */}
      <section>
        <SectionLabel>Custom Ignore Patterns</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Add patterns to skip additional files or folders. Use exact names like{' '}
          <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>vendor</code>
          {' '}or glob-like suffixes like{' '}
          <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>*.log</code>.
        </p>

        {/* Tag input */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '12px',
          }}
        >
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              placeholder="e.g. vendor or *.log"
              onChange={(e) => {
                setInputValue(e.target.value);
                setInputError(null);
              }}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: '6px',
                border: inputError ? '1px solid var(--error, #e55)' : '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = inputError ? 'var(--error, #e55)' : 'var(--accent)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = inputError ? 'var(--error, #e55)' : 'var(--border)';
              }}
            />
            {inputError && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '2px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  background: 'var(--bg-secondary, var(--bg))',
                  border: '1px solid var(--error, #e55)',
                  color: 'var(--error, #e55)',
                  fontSize: '11px',
                  zIndex: 1,
                }}
              >
                {inputError}
              </div>
            )}
          </div>
          <button
            onClick={handleAdd}
            style={addButtonStyle}
          >
            Add
          </button>
        </div>

        {/* Active custom patterns */}
        {patterns.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No custom patterns. The built-in list above is still applied.
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {patterns.map((p) => (
              <Tag
                key={p}
                label={p}
                removable={true}
                onRemove={() => handleRemove(p)}
              />
            ))}
          </div>
        )}
      </section>

    </div>
  );
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-muted)',
        marginBottom: '8px',
      }}
    >
      {children}
    </div>
  );
}

function Tag({
  label,
  removable,
  onRemove,
}: {
  label: string;
  removable: boolean;
  onRemove?: () => void;
}): React.ReactElement {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        borderRadius: '4px',
        border: '1px solid var(--border)',
        background: 'var(--bg-tertiary)',
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-secondary)',
        userSelect: 'none',
      }}
    >
      {label}
      {removable && onRemove && (
        <button
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: '13px',
            lineHeight: 1,
            padding: '0',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}

const addButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '7px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text)',
  fontSize: '12px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
