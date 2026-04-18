/**
 * FontDropdown.tsx — Single font-family selector dropdown with "Custom..." reveal.
 *
 * Shows a curated list of FontOption entries. When the user picks "Custom...",
 * a text input appears for arbitrary font-family strings. Wave 35 Phase F.
 */

import React, { useCallback, useId, useMemo } from 'react';

import type { FontOption } from '../../themes/fontPickerOptions';

// ── Styles ────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 600, color: 'var(--text-text-semantic-muted)',
  marginBottom: '4px', display: 'block',
};

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '5px 8px', borderRadius: '6px', fontSize: '12px',
  border: '1px solid var(--border-subtle)', background: 'var(--surface-inset)',
  color: 'var(--text-text-semantic-primary)', cursor: 'pointer',
};

const customInputStyle: React.CSSProperties = {
  width: '100%', padding: '5px 8px', borderRadius: '6px', fontSize: '12px',
  border: '1px solid var(--border-subtle)', background: 'var(--surface-inset)',
  color: 'var(--text-text-semantic-primary)', marginTop: '4px', boxSizing: 'border-box',
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FontDropdownProps {
  label: string;
  options: FontOption[];
  value: string;
  onChange: (value: string) => void;
}

const CUSTOM_ID = '__custom__';

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveSelectValue(value: string, options: FontOption[]): string {
  const match = options.find((o) => o.value === value);
  return match ? match.id : CUSTOM_ID;
}

function resolveCustomValue(value: string, options: FontOption[]): string {
  const isKnown = options.some((o) => o.value === value);
  return isKnown ? '' : value;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface FontSelectProps {
  selectId: string;
  options: FontOption[];
  selectedId: string;
  label: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}

function FontSelect({ selectId, options, selectedId, label, onChange }: FontSelectProps): React.ReactElement {
  return (
    <select
      id={selectId}
      style={selectStyle}
      value={selectedId}
      onChange={onChange}
      data-testid={`font-select-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>{opt.label}</option>
      ))}
      <option value={CUSTOM_ID}>Custom…</option>
    </select>
  );
}

interface CustomFontInputProps {
  customValue: string;
  label: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function CustomFontInput({ customValue, label, onChange }: CustomFontInputProps): React.ReactElement {
  return (
    <input
      type="text"
      style={customInputStyle}
      value={customValue}
      onChange={onChange}
      placeholder='e.g. "Fira Code", monospace'
      aria-label={`Custom font-family for ${label}`}
      data-testid={`font-custom-${label.toLowerCase().replace(/\s+/g, '-')}`}
    />
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FontDropdown({ label, options, value, onChange }: FontDropdownProps): React.ReactElement {
  const uid = useId();
  const selectId = `font-dd-${uid}`;
  const selectedId = useMemo(() => resolveSelectValue(value, options), [value, options]);
  const customValue = useMemo(() => resolveCustomValue(value, options), [value, options]);
  const isCustom = selectedId === CUSTOM_ID;

  const handleSelectChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const chosen = e.target.value;
    if (chosen === CUSTOM_ID) { onChange(''); return; }
    const opt = options.find((o) => o.id === chosen);
    if (opt) onChange(opt.value);
  }, [onChange, options]);

  const handleCustomInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  return (
    <div>
      <label htmlFor={selectId} style={labelStyle}>{label}</label>
      <FontSelect
        selectId={selectId}
        options={options}
        selectedId={selectedId}
        label={label}
        onChange={handleSelectChange}
      />
      {isCustom && <CustomFontInput customValue={customValue} label={label} onChange={handleCustomInput} />}
    </div>
  );
}
