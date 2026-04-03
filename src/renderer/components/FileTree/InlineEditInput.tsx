/**
 * InlineEditInput - input field for inline rename / new file creation.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

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

function trimmedValue(value: string): string {
  return value.trim();
}

function selectInitialName(input: HTMLInputElement, initialValue: string): void {
  const dotIndex = initialValue.lastIndexOf('.');
  if (dotIndex > 0) {
    input.setSelectionRange(0, dotIndex);
    return;
  }
  input.select();
}

function useInitialSelection(
  inputRef: React.RefObject<HTMLInputElement | null>,
  initialValue: string,
): void {
  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.focus();
    selectInitialName(inputRef.current, initialValue);
  }, [initialValue, inputRef]);
}

function submitInlineEdit(
  value: string,
  setError: React.Dispatch<React.SetStateAction<string | null>>,
  onConfirm: (value: string) => void,
): void {
  const error = validate(value);
  if (error) {
    setError(error);
    return;
  }
  onConfirm(trimmedValue(value));
}

function useKeyDownHandler(
  submitValue: () => void,
  onCancel: () => void,
): (e: React.KeyboardEvent) => void {
  return useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        submitValue();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [onCancel, submitValue],
  );
}

function useBlurHandler({
  value,
  initialValue,
  onConfirm,
  onCancel,
}: {
  value: string;
  initialValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}): () => void {
  return useCallback(() => {
    const nextValue = trimmedValue(value);
    const error = validate(value);
    if (error || nextValue === initialValue) {
      onCancel();
      return;
    }
    onConfirm(nextValue);
  }, [initialValue, onCancel, onConfirm, value]);
}

function useInlineEditHandlers({
  value,
  initialValue,
  onConfirm,
  onCancel,
  setError,
}: {
  value: string;
  initialValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}): {
  handleBlur: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
} {
  const submitValue = useCallback(
    () => submitInlineEdit(value, setError, onConfirm),
    [onConfirm, setError, value],
  );

  return {
    handleBlur: useBlurHandler({ value, initialValue, onConfirm, onCancel }),
    handleKeyDown: useKeyDownHandler(submitValue, onCancel),
  };
}

function inputStyle(error: string | null): React.CSSProperties {
  return {
    width: '100%',
    padding: '0 4px',
    border: error ? '1px solid var(--status-error)' : '1px solid var(--interactive-accent)',
    borderRadius: '2px',
    fontSize: '0.8125rem',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    boxSizing: 'border-box',
    height: '20px',
    lineHeight: '20px',
  };
}

function InlineEditField({
  inputRef,
  value,
  error,
  onChange,
  onBlur,
  onKeyDown,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  error: string | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}): React.ReactElement {
  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      <input
        ref={inputRef as React.RefObject<HTMLInputElement | null>}
        type="text"
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className="bg-surface-base text-text-semantic-primary"
        style={inputStyle(error)}
      />
      {error && <EditError message={error} />}
    </div>
  );
}

export function InlineEditInput({
  initialValue,
  onConfirm,
  onCancel,
}: InlineEditInputProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  useInitialSelection(inputRef, initialValue);
  const { handleBlur, handleKeyDown } = useInlineEditHandlers({
    value,
    initialValue,
    onConfirm,
    onCancel,
    setError,
  });
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    setError(null);
  }, []);

  return (
    <InlineEditField
      inputRef={inputRef}
      value={value}
      error={error}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}

function EditError({ message }: { message: string }): React.ReactElement {
  return (
    <div
      className="bg-surface-panel text-status-error"
      style={{
        position: 'absolute',
        top: '22px',
        left: 0,
        right: 0,
        padding: '2px 6px',
        border: '1px solid var(--error, #e55)',
        borderRadius: '2px',
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
