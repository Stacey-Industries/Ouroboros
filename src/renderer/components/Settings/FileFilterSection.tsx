import React, { useRef, useState } from 'react';
import type { AppConfig } from '../../types/electron';
import { SectionLabel } from './settingsStyles';

interface FileFilterSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

interface FileFilterInputState {
  inputError: string | null;
  inputRef: React.RefObject<HTMLInputElement>;
  inputValue: string;
  handleAdd: () => void;
  handleChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

const BASELINE_PATTERNS = ['.git', '__pycache__'];

const stackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

const helperTextStyle: React.CSSProperties = {
  fontSize: '12px',
  marginBottom: '10px',
};

const tagListStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
};

const tagStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  userSelect: 'none',
};

const inputRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  marginBottom: '12px',
};

const inputWrapperStyle: React.CSSProperties = {
  flex: 1,
  position: 'relative',
};

const removeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '13px',
  lineHeight: 1,
  padding: '0',
  display: 'flex',
  alignItems: 'center',
};

const addButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '7px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  fontSize: '12px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const emptyStateStyle: React.CSSProperties = {
  fontSize: '12px',
  fontStyle: 'italic',
};

function validatePattern(value: string, patterns: string[]): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Pattern cannot be empty';
  if (trimmed.includes('/') || trimmed.includes('\\')) return 'Use bare names only (e.g. vendor or *.log), not paths';
  if (patterns.includes(trimmed)) return 'Pattern already exists';
  return null;
}

function getInputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '7px 10px',
    borderRadius: '6px',
    border: hasError ? '1px solid var(--error, #e55)' : '1px solid var(--border)',
    background: 'var(--bg)',
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    boxSizing: 'border-box',
  };
}

function useFileFilterInput(
  patterns: string[],
  onChange: FileFilterSectionProps['onChange']
): FileFilterInputState {
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleAdd(): void {
    const trimmed = inputValue.trim();
    const error = validatePattern(trimmed, patterns);
    if (error) return void setInputError(error);
    onChange('fileTreeIgnorePatterns', [...patterns, trimmed]);
    setInputValue('');
    setInputError(null);
    inputRef.current?.focus();
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    setInputValue(event.target.value);
    setInputError(null);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    handleAdd();
  }

  return { inputValue, inputError, inputRef, handleAdd, handleChange, handleKeyDown };
}

function FileFilterTag({
  label,
  onRemove,
}: {
  label: string;
  onRemove?: () => void;
}): React.ReactElement {
  return (
    <span className="text-text-semantic-secondary" style={tagStyle}>
      {label}
      {onRemove && <button aria-label={`Remove ${label}`} onClick={onRemove} className="text-text-semantic-muted" style={removeButtonStyle}>x</button>}
    </span>
  );
}

function FilterInputError({ message }: { message: string | null }): React.ReactElement | null {
  if (!message) return null;

  return (
    <div className="text-status-error" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '2px', padding: '4px 8px', borderRadius: '4px', background: 'var(--bg-secondary, var(--bg))', border: '1px solid var(--error, #e55)', fontSize: '11px', zIndex: 1 }}>
      {message}
    </div>
  );
}

function BaselinePatternsSection(): React.ReactElement {
  return (
    <section>
      <SectionLabel>Always Ignored (built-in)</SectionLabel>
      <p className="text-text-semantic-muted" style={helperTextStyle}>These patterns are always active and cannot be removed. Dotfiles and common project folders stay visible unless you add them below.</p>
      <div style={tagListStyle}>{BASELINE_PATTERNS.map((pattern) => <FileFilterTag key={pattern} label={pattern} />)}</div>
    </section>
  );
}

function PatternInputRow({
  inputError,
  inputRef,
  inputValue,
  onAdd,
  onChange,
  onKeyDown,
}: {
  inputError: string | null;
  inputRef: React.RefObject<HTMLInputElement>;
  inputValue: string;
  onAdd: () => void;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}): React.ReactElement {
  return (
    <div style={inputRowStyle}>
      <div style={inputWrapperStyle}>
        <input ref={inputRef} type="text" value={inputValue} placeholder="e.g. vendor or *.log" onChange={onChange} onKeyDown={onKeyDown} className="text-text-semantic-primary" style={getInputStyle(Boolean(inputError))} onFocus={(event) => { event.currentTarget.style.borderColor = inputError ? 'var(--error, #e55)' : 'var(--accent)'; }} onBlur={(event) => { event.currentTarget.style.borderColor = inputError ? 'var(--error, #e55)' : 'var(--border)'; }} />
        <FilterInputError message={inputError} />
      </div>
      <button onClick={onAdd} className="text-text-semantic-primary" style={addButtonStyle}>Add</button>
    </div>
  );
}

function ActivePatternList({
  patterns,
  onRemove,
}: {
  patterns: string[];
  onRemove: (pattern: string) => void;
}): React.ReactElement {
  if (patterns.length === 0) {
    return <p className="text-text-semantic-muted" style={emptyStateStyle}>No custom patterns. The built-in list above is still applied.</p>;
  }

  return (
    <div style={tagListStyle}>
      {patterns.map((pattern) => <FileFilterTag key={pattern} label={pattern} onRemove={() => onRemove(pattern)} />)}
    </div>
  );
}

function CustomPatternsSection({
  patterns,
  input,
  onRemove,
}: {
  patterns: string[];
  input: FileFilterInputState;
  onRemove: (pattern: string) => void;
}): React.ReactElement {
  return (
    <section>
      <SectionLabel>Custom Ignore Patterns</SectionLabel>
      <p className="text-text-semantic-muted" style={helperTextStyle}>Add patterns to skip additional files or folders. Use exact names like <code className="text-text-semantic-secondary" style={{ fontFamily: 'var(--font-mono)' }}>vendor</code> or glob-like suffixes like <code className="text-text-semantic-secondary" style={{ fontFamily: 'var(--font-mono)' }}>.log</code> with a wildcard prefix, for example <code className="text-text-semantic-secondary" style={{ fontFamily: 'var(--font-mono)' }}>*.log</code>.</p>
      <PatternInputRow inputError={input.inputError} inputRef={input.inputRef} inputValue={input.inputValue} onAdd={input.handleAdd} onChange={input.handleChange} onKeyDown={input.handleKeyDown} />
      <ActivePatternList patterns={patterns} onRemove={onRemove} />
    </section>
  );
}

export function FileFilterSection({
  draft,
  onChange,
}: FileFilterSectionProps): React.ReactElement {
  const patterns = draft.fileTreeIgnorePatterns ?? [];
  const input = useFileFilterInput(patterns, onChange);

  function handleRemove(pattern: string): void {
    onChange('fileTreeIgnorePatterns', patterns.filter((candidate) => candidate !== pattern));
  }

  return (
    <div style={stackStyle}>
      <BaselinePatternsSection />
      <CustomPatternsSection patterns={patterns} input={input} onRemove={handleRemove} />
    </div>
  );
}
