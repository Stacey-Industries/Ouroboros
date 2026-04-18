/**
 * SpinnerPresetPicker.tsx — Dropdown of spinner presets + custom input + live preview.
 *
 * Wave 35 Phase E.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  DEFAULT_SPINNER_CHARS,
  SPINNER_PRESETS,
} from '../../themes/thinkingDefaults';

// ── Live spinner preview hook ─────────────────────────────────────────────────

const PREVIEW_INTERVAL_MS = 100;
const CUSTOM_ID = 'custom';

function usePreviewFrame(chars: string): string {
  const [frame, setFrame] = useState(0);
  const charsRef = useRef(chars);
  useEffect(() => { charsRef.current = chars; }, [chars]);
  useEffect(() => {
    setFrame(0);
    const id = setInterval(
      () => setFrame((f) => (f + 1) % charsRef.current.length),
      PREVIEW_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [chars]);
  const safeChars = chars.length > 0 ? chars : DEFAULT_SPINNER_CHARS;
  return safeChars[frame % safeChars.length] ?? safeChars[0];
}

function resolvePresetId(chars: string): string {
  const match = SPINNER_PRESETS.find((p) => p.chars === chars);
  return match ? match.id : CUSTOM_ID;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
};

const selectStyle: React.CSSProperties = {
  padding: '5px 8px', borderRadius: '6px',
  border: '1px solid var(--border-subtle)', background: 'var(--surface-inset)',
  color: 'var(--text-text-semantic-primary)', fontSize: '12px', cursor: 'pointer',
};

const customInputStyle: React.CSSProperties = {
  padding: '5px 8px', borderRadius: '6px',
  border: '1px solid var(--border-subtle)', background: 'var(--surface-inset)',
  color: 'var(--text-text-semantic-primary)', fontSize: '12px', width: '140px',
};

const previewStyle: React.CSSProperties = {
  fontSize: '16px', width: '20px', textAlign: 'center',
  color: 'var(--interactive-accent)', fontFamily: 'monospace',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function PresetSelect({ value, onChange }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}): React.ReactElement {
  return (
    <select style={selectStyle} value={value} onChange={onChange}
      aria-label="Spinner preset" data-testid="spinner-preset-select"
    >
      {SPINNER_PRESETS.map((p) => (
        <option key={p.id} value={p.id}>{p.label}</option>
      ))}
      <option value={CUSTOM_ID}>Custom…</option>
    </select>
  );
}

function CustomInput({ value, onChange }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}): React.ReactElement {
  return (
    <input style={customInputStyle} type="text" value={value} onChange={onChange}
      placeholder="Enter spinner chars" aria-label="Custom spinner characters"
      data-testid="spinner-custom-input"
    />
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface SpinnerPresetPickerProps {
  chars: string;
  onChange: (chars: string) => void;
}

export function SpinnerPresetPicker({ chars, onChange }: SpinnerPresetPickerProps): React.ReactElement {
  const [presetId, setPresetId] = useState(() => resolvePresetId(chars));
  const [customChars, setCustomChars] = useState(
    () => resolvePresetId(chars) === CUSTOM_ID ? chars : '',
  );
  const previewChar = usePreviewFrame(chars.length > 0 ? chars : DEFAULT_SPINNER_CHARS);

  const handlePresetChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setPresetId(id);
    if (id !== CUSTOM_ID) {
      const preset = SPINNER_PRESETS.find((p) => p.id === id);
      if (preset) onChange(preset.chars);
    }
  }, [onChange]);

  const handleCustomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomChars(val);
    if (val.length > 0) onChange(val);
  }, [onChange]);

  return (
    <div style={rowStyle}>
      <PresetSelect value={presetId} onChange={handlePresetChange} />
      {presetId === CUSTOM_ID && (
        <CustomInput value={customChars} onChange={handleCustomChange} />
      )}
      <span style={previewStyle} aria-label="Spinner preview" data-testid="spinner-preview">
        {previewChar}
      </span>
    </div>
  );
}
