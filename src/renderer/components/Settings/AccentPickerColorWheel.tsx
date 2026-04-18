/**
 * AccentPickerColorWheel.tsx — native <input type="color"> + hex text input pair.
 *
 * Wave 35 Phase D. Color wheel and hex text are bidirectionally synced.
 * onChange fires on every change (debounce is handled by the parent).
 *
 * Sync strategy: color input is controlled (value={hex}). Hex text input uses
 * key={hex} so it remounts with the correct defaultValue whenever hex changes
 * from outside — avoids controlled-input flicker during typing.
 */

import React, { useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AccentPickerColorWheelProps {
  hex: string;
  onChange: (hex: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise any valid CSS hex to lowercase 7-char form, or return null. */
function normaliseHex(raw: string): string | null {
  const trimmed = raw.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) return withHash.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const [, r, g, b] = withHash;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '10px' };

const colorInputStyle: React.CSSProperties = {
  width: '36px', height: '36px', padding: '2px',
  border: '1px solid var(--border-subtle)', borderRadius: '6px',
  background: 'var(--surface-inset)', cursor: 'pointer', flexShrink: 0,
};

const hexInputStyle: React.CSSProperties = {
  width: '90px', padding: '6px 8px', borderRadius: '6px',
  border: '1px solid var(--border-subtle)', background: 'var(--surface-inset)',
  color: 'var(--text-text-semantic-primary)', fontSize: '12px',
  fontFamily: 'var(--font-mono, monospace)',
};

// ── Handlers hook ─────────────────────────────────────────────────────────────

function useColorWheelHandlers(hex: string, onChange: (hex: string) => void) {
  // Color wheel fires onChange directly — parent sets hex, key={hex} remounts text input.
  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => { onChange(e.target.value); },
    [onChange],
  );

  // Hex text: validate on blur; invalid input reverts via key={hex} remount (no DOM mutation).
  const handleHexBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const normalised = normaliseHex(e.target.value);
      if (normalised && normalised !== hex) onChange(normalised);
      // If invalid or unchanged, parent hex stays — key={hex} remount resets the field.
    },
    [hex, onChange],
  );

  const handleHexChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const normalised = normaliseHex(e.target.value);
      if (normalised) onChange(normalised);
    },
    [onChange],
  );

  return { handleColorChange, handleHexBlur, handleHexChange };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AccentPickerColorWheel({
  hex,
  onChange,
}: AccentPickerColorWheelProps): React.ReactElement {
  const { handleColorChange, handleHexBlur, handleHexChange } =
    useColorWheelHandlers(hex, onChange);

  return (
    <div style={rowStyle}>
      <input
        aria-label="Accent color picker"
        onChange={handleColorChange}
        style={colorInputStyle}
        type="color"
        value={hex}
      />
      <input
        aria-label="Accent color hex value"
        defaultValue={hex}
        key={hex}
        maxLength={7}
        onBlur={handleHexBlur}
        onChange={handleHexChange}
        placeholder="#rrggbb"
        style={hexInputStyle}
        type="text"
      />
    </div>
  );
}
