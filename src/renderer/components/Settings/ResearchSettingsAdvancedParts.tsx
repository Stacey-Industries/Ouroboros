/**
 * ResearchSettingsAdvancedParts.tsx — Style constants and primitive components
 * for ResearchSettingsAdvanced.
 */

import React from 'react';

// ─── Style constants ──────────────────────────────────────────────────────────

export const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 0',
};

export const labelColStyle: React.CSSProperties = { flex: 1, marginRight: '16px' };
export const labelTextStyle: React.CSSProperties = { fontSize: '13px', fontWeight: 500 };
export const helpTextStyle: React.CSSProperties = { fontSize: '11px', marginTop: '2px' };

export const inputStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border-semantic)',
  background: 'var(--surface-raised)',
  fontSize: '13px',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
  width: '80px',
  boxSizing: 'border-box',
};

// ─── MiniToggle ───────────────────────────────────────────────────────────────

export interface MiniToggleProps {
  checked: boolean;
  label: string;
  onChange: (v: boolean) => void;
}

export function MiniToggle({ checked, label, onChange }: MiniToggleProps): React.ReactElement {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      role="switch"
      style={{
        background: checked ? 'var(--interactive-accent)' : 'var(--surface-raised)',
        border: checked ? 'none' : '1px solid var(--border-semantic)',
        borderRadius: '11px',
        cursor: 'pointer',
        flexShrink: 0,
        height: '22px',
        padding: 0,
        position: 'relative',
        transition: 'background 0.15s ease',
        width: '40px',
      }}
      type="button"
      onClick={() => onChange(!checked)}
    >
      <span
        style={{
          background: checked ? 'var(--text-on-accent)' : 'var(--text-semantic-muted)',
          borderRadius: '50%',
          height: '18px',
          left: checked ? '20px' : '2px',
          position: 'absolute',
          top: '2px',
          transition: 'left 0.15s ease',
          width: '18px',
        }}
      />
    </button>
  );
}

// ─── KnobRow ──────────────────────────────────────────────────────────────────

export interface KnobRowProps {
  label: string;
  help: string;
  control: React.ReactNode;
}

export function KnobRow({ label, help, control }: KnobRowProps): React.ReactElement {
  return (
    <div style={rowStyle}>
      <div style={labelColStyle}>
        <div className="text-text-semantic-primary" style={labelTextStyle}>
          {label}
        </div>
        <div className="text-text-semantic-muted" style={helpTextStyle}>
          {help}
        </div>
      </div>
      {control}
    </div>
  );
}

// ─── ConfidenceRadioGroup ─────────────────────────────────────────────────────

export type PatternConfidence = 'high' | 'medium' | 'low';

const CONFIDENCE_OPTIONS: Array<{ value: PatternConfidence; label: string }> = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export function ConfidenceRadioGroup({
  value,
  onChange,
}: {
  value: PatternConfidence;
  onChange: (v: PatternConfidence) => void;
}): React.ReactElement {
  return (
    <div
      aria-label="Minimum pattern confidence"
      role="radiogroup"
      style={{ display: 'flex', gap: '12px', flexShrink: 0 }}
    >
      {CONFIDENCE_OPTIONS.map((opt) => (
        <label
          key={opt.value}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}
        >
          <input
            checked={value === opt.value}
            name="fact-claim-min-confidence"
            type="radio"
            value={opt.value}
            onChange={() => onChange(opt.value)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}
