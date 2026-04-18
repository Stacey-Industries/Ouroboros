/**
 * AccentPicker.tsx — inline accent color picker for the Appearance settings pane.
 *
 * Wave 35 Phase D. Reads config.theming.accentOverride; writes it back via
 * useConfig().set with a 16ms debounce. useTokenOverrides (Phase A) applies
 * the change to the DOM without a reload.
 *
 * When no override is set, reads the computed --interactive-accent for display
 * only, showing "(theme default)" as the label.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useConfig } from '../../hooks/useConfig';
import type { AppConfig } from '../../types/electron';
import { AccentPickerColorWheel } from './AccentPickerColorWheel';
import { panelStyle, sectionLabelStyle } from './appearanceThemeControlsStyles';

// ── Constants & helpers ───────────────────────────────────────────────────────

const DEBOUNCE_MS = 16;
const FALLBACK_HEX = '#5865f2'; // hardcoded: static fallback when CSS var cannot be read in tests/SSR

function readComputedAccent(): string {
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue('--interactive-accent').trim();
  return val || FALLBACK_HEX;
}

function omitAccent(theming: AppConfig['theming']): AppConfig['theming'] {
  if (!theming) return {};
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { accentOverride: _dropped, ...rest } = theming;
  return rest;
}

type ConfigSet = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => Promise<void>;

function writeAccent(set: ConfigSet, theming: AppConfig['theming'], hex: string): void {
  void set('theming', { ...(theming ?? {}), accentOverride: hex });
}

function resetAccent(set: ConfigSet, theming: AppConfig['theming']): void {
  void set('theming', omitAccent(theming));
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: '12px', flexWrap: 'wrap',
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px', color: 'var(--text-text-semantic-muted)', flexShrink: 0,
};

function resetButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 12px', borderRadius: '6px',
    border: '1px solid var(--border-subtle)', background: 'transparent',
    color: disabled ? 'var(--text-text-semantic-muted)' : 'var(--text-text-semantic-primary)',
    fontSize: '12px', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap', flexShrink: 0,
  };
}

// ── useAccentPicker hook ──────────────────────────────────────────────────────

function useAccentPicker() {
  const { config, set } = useConfig();
  const override = config?.theming?.accentOverride;
  const [displayHex, setDisplayHex] = useState<string>(() => override ?? readComputedAccent());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setDisplayHex(override ?? readComputedAccent()); }, [override]);

  useEffect(() => () => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
  }, []);

  const handleChange = useCallback((hex: string) => {
    setDisplayHex(hex);
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      writeAccent(set, config?.theming, hex);
      debounceRef.current = null;
    }, DEBOUNCE_MS);
  }, [set, config?.theming]);

  const handleReset = useCallback(() => {
    if (debounceRef.current !== null) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    resetAccent(set, config?.theming);
    setDisplayHex(readComputedAccent());
  }, [set, config?.theming]);

  return { displayHex, hasOverride: Boolean(override), handleChange, handleReset };
}

// ── AccentPicker ──────────────────────────────────────────────────────────────

export function AccentPicker(): React.ReactElement {
  const { displayHex, hasOverride, handleChange, handleReset } = useAccentPicker();
  const statusLabel = hasOverride ? `Custom: ${displayHex}` : `(theme default: ${displayHex})`;

  return (
    <section>
      <div className="text-text-semantic-muted" style={sectionLabelStyle}>Accent Color</div>
      <div style={panelStyle}>
        <div style={rowStyle}>
          <AccentPickerColorWheel hex={displayHex} onChange={handleChange} />
          <p style={labelStyle}>{statusLabel}</p>
          <button
            disabled={!hasOverride}
            onClick={handleReset}
            style={resetButtonStyle(!hasOverride)}
            type="button"
          >
            Reset to theme default
          </button>
        </div>
      </div>
    </section>
  );
}
