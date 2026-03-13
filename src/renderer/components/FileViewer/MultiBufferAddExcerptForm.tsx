import React, { memo, useCallback, useState } from 'react';
import type { BufferExcerpt } from '../../types/electron';

export interface AddExcerptFormProps {
  onAdd: (excerpt: BufferExcerpt) => void;
  onCancel: () => void;
}

interface ExcerptFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
  autoFocus?: boolean;
  min?: string;
}

interface RangeFieldsProps {
  startLine: string;
  endLine: string;
  setStartLine: (value: string) => void;
  setEndLine: (value: string) => void;
}

const FORM_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '12px',
  backgroundColor: 'var(--bg-secondary)',
  borderBottom: '1px solid var(--border)',
  fontFamily: 'var(--font-ui)',
};

const FORM_TITLE_STYLE: React.CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: 'var(--text)',
};

const FIELD_LABEL_STYLE: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-ui)',
  marginBottom: '2px',
};

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '3px',
  color: 'var(--text)',
  padding: '4px 8px',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
  width: '100%',
};

const RANGE_FIELDS_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
};

const ACTIONS_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  justifyContent: 'flex-end',
};

const CANCEL_BUTTON_STYLE: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: '3px',
  color: 'var(--text-muted)',
  padding: '4px 12px',
  fontSize: '0.8125rem',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
};

const SUBMIT_BUTTON_STYLE: React.CSSProperties = {
  background: 'var(--accent)',
  border: 'none',
  borderRadius: '3px',
  color: 'var(--bg)',
  padding: '4px 12px',
  fontSize: '0.8125rem',
  cursor: 'pointer',
  fontWeight: 600,
  fontFamily: 'var(--font-ui)',
};

function createExcerpt(
  filePath: string,
  startLine: string,
  endLine: string,
  label: string,
): BufferExcerpt | null {
  if (!filePath.trim()) return null;
  const start = parseInt(startLine, 10);
  const end = parseInt(endLine, 10);
  if (Number.isNaN(start) || Number.isNaN(end) || start < 1 || end < start) return null;
  return { filePath: filePath.trim(), startLine: start, endLine: end, label: label.trim() || undefined };
}

function useExcerptFormState(onAdd: (excerpt: BufferExcerpt) => void) {
  const [filePath, setFilePath] = useState('');
  const [startLine, setStartLine] = useState('1');
  const [endLine, setEndLine] = useState('50');
  const [label, setLabel] = useState('');

  const handleSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    const excerpt = createExcerpt(filePath, startLine, endLine, label);
    if (excerpt) onAdd(excerpt);
  }, [endLine, filePath, label, onAdd, startLine]);

  return { filePath, startLine, endLine, label, setFilePath, setStartLine, setEndLine, setLabel, handleSubmit };
}

function ExcerptField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoFocus = false,
  min,
}: ExcerptFieldProps): React.ReactElement {
  return (
    <div>
      <div style={FIELD_LABEL_STYLE}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={INPUT_STYLE}
        autoFocus={autoFocus}
        min={min}
      />
    </div>
  );
}

function RangeFields({
  startLine,
  endLine,
  setStartLine,
  setEndLine,
}: RangeFieldsProps): React.ReactElement {
  return (
    <div style={RANGE_FIELDS_STYLE}>
      <div style={{ flex: 1 }}>
        <ExcerptField
          label="Start line"
          type="number"
          value={startLine}
          onChange={setStartLine}
          min="1"
        />
      </div>
      <div style={{ flex: 1 }}>
        <ExcerptField
          label="End line"
          type="number"
          value={endLine}
          onChange={setEndLine}
          min="1"
        />
      </div>
    </div>
  );
}

function ExcerptActions({ onCancel }: Pick<AddExcerptFormProps, 'onCancel'>): React.ReactElement {
  return (
    <div style={ACTIONS_STYLE}>
      <button type="button" onClick={onCancel} style={CANCEL_BUTTON_STYLE}>
        Cancel
      </button>
      <button type="submit" style={SUBMIT_BUTTON_STYLE}>
        Add
      </button>
    </div>
  );
}

export const AddExcerptForm = memo(function AddExcerptForm({
  onAdd,
  onCancel,
}: AddExcerptFormProps): React.ReactElement {
  const form = useExcerptFormState(onAdd);

  return (
    <form onSubmit={form.handleSubmit} style={FORM_STYLE}>
      <div style={FORM_TITLE_STYLE}>Add Excerpt</div>
      <ExcerptField
        label="File path (absolute)"
        value={form.filePath}
        onChange={form.setFilePath}
        placeholder="/path/to/file.ts"
        autoFocus
      />
      <RangeFields
        startLine={form.startLine}
        endLine={form.endLine}
        setStartLine={form.setStartLine}
        setEndLine={form.setEndLine}
      />
      <ExcerptField
        label="Label (optional)"
        value={form.label}
        onChange={form.setLabel}
        placeholder="e.g. handleClick"
      />
      <ExcerptActions onCancel={onCancel} />
    </form>
  );
});
