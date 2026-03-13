import React from 'react';
import type { AppConfig } from '../../types/electron';
import { SectionLabel } from './settingsStyles';

interface FontSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

const UI_FONT_SIZE_MIN = 11;
const UI_FONT_SIZE_MAX = 18;
const DEFAULT_UI_FONT_SIZE = 13;

const PREVIEW_TEXT = 'The quick brown fox jumps over the lazy dog';

export function FontSection({ draft, onChange }: FontSectionProps): React.ReactElement {
  const fontUI = draft.fontUI ?? '';
  const fontMono = draft.fontMono ?? '';
  const fontSizeUI = draft.fontSizeUI ?? DEFAULT_UI_FONT_SIZE;

  function clampSize(v: number): number {
    return Math.max(UI_FONT_SIZE_MIN, Math.min(UI_FONT_SIZE_MAX, v));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* UI Font family */}
      <section>
        <SectionLabel>UI Font Family</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Font used for the interface. Leave blank to use the system default.
        </p>
        <input
          type="text"
          value={fontUI}
          onChange={(e) => onChange('fontUI', e.target.value)}
          placeholder="e.g. Inter, Segoe UI, SF Pro Display"
          aria-label="UI font family"
          style={inputStyle}
          spellCheck={false}
        />
        {/* Live preview */}
        <div
          aria-label="UI font preview"
          style={{
            marginTop: '10px',
            padding: '10px 14px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg-tertiary)',
            fontFamily: fontUI ? `"${fontUI}", system-ui, sans-serif` : 'system-ui, sans-serif',
            fontSize: '14px',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontFamily: 'inherit' }}>
            Preview ({fontUI || 'system default'})
          </div>
          <div>{PREVIEW_TEXT}</div>
          <div style={{ fontSize: '12px' }}>0123456789 — ABCDEFGHIJKLMNOPQRSTUVWXYZ</div>
        </div>
      </section>

      {/* Mono Font family */}
      <section>
        <SectionLabel>Monospace Font Family</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Font used for code, file viewer, and terminal UI. Leave blank for the theme default.
        </p>
        <input
          type="text"
          value={fontMono}
          onChange={(e) => onChange('fontMono', e.target.value)}
          placeholder="e.g. JetBrains Mono, Cascadia Code, Fira Code"
          aria-label="Monospace font family"
          style={inputStyle}
          spellCheck={false}
        />
        {/* Live preview */}
        <div
          aria-label="Monospace font preview"
          style={{
            marginTop: '10px',
            padding: '10px 14px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg-tertiary)',
            fontFamily: fontMono ? `"${fontMono}", monospace` : 'monospace',
            fontSize: '13px',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
          }}
        >
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              marginBottom: '4px',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            Preview ({fontMono || 'theme default'})
          </div>
          <div>const greeting = &quot;Hello, world!&quot;;</div>
          <div>{'function add(a: number, b: number): number {'}</div>
          <div>{'  return a + b; // => 42'}</div>
          <div>{'}'}</div>
        </div>
      </section>

      {/* UI Font Size */}
      <section>
        <SectionLabel>UI Font Size</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Base font size for the interface ({UI_FONT_SIZE_MIN}–{UI_FONT_SIZE_MAX}px). Default: {DEFAULT_UI_FONT_SIZE}px.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            type="range"
            min={UI_FONT_SIZE_MIN}
            max={UI_FONT_SIZE_MAX}
            step={1}
            value={fontSizeUI}
            onChange={(e) => onChange('fontSizeUI', clampSize(parseInt(e.target.value, 10)))}
            aria-label="UI font size slider"
            style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          <span
            style={{
              minWidth: '36px',
              textAlign: 'right',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {fontSizeUI}px
          </span>
          {fontSizeUI !== DEFAULT_UI_FONT_SIZE && (
            <button
              onClick={() => onChange('fontSizeUI', DEFAULT_UI_FONT_SIZE)}
              style={resetButtonStyle}
            >
              Reset
            </button>
          )}
        </div>

        {/* Size preview */}
        <div
          style={{
            marginTop: '12px',
            padding: '10px 14px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg-tertiary)',
            fontFamily: fontUI ? `"${fontUI}", system-ui, sans-serif` : 'system-ui, sans-serif',
            fontSize: `${fontSizeUI}px`,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {PREVIEW_TEXT}
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
          Font size changes apply after Save.
        </p>
      </section>

    </div>
  );
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
};

const resetButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '4px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-muted)',
  fontSize: '11px',
  cursor: 'pointer',
};
