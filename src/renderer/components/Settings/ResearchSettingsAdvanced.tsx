/**
 * ResearchSettingsAdvanced.tsx — Collapsible "Advanced — tuning knobs" subsection
 * for ResearchSettings.
 *
 * Wave 30 Phase I. All 5 threshold knobs:
 *   - stalenessConfidenceFloor  (slider 0.0–1.0)
 *   - factClaimEnabled          (toggle)
 *   - factClaimMinPatternConfidence (radio: High / Medium / Low)
 *   - preEditDryRunOnly         (toggle)
 *   - maxLatencyMs              (number input 100–5000)
 *
 * Changes apply immediately — evaluators read live config on every call.
 */

import React, { useState } from 'react';

import type { AppConfig } from '../../types/electron';
import { SectionLabel } from './settingsStyles';

// ─── Types ────────────────────────────────────────────────────────────────────

type ResearchSettingsRecord = NonNullable<AppConfig['researchSettings']>;
type PatternConfidence = 'high' | 'medium' | 'low';

export interface ResearchSettingsAdvancedProps {
  settings: ResearchSettingsRecord;
  onUpdate: (patch: Partial<ResearchSettingsRecord>) => void;
}

// ─── Style constants ──────────────────────────────────────────────────────────

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 0',
};

const labelColStyle: React.CSSProperties = { flex: 1, marginRight: '16px' };
const labelTextStyle: React.CSSProperties = { fontSize: '13px', fontWeight: 500 };
const helpTextStyle: React.CSSProperties = { fontSize: '11px', marginTop: '2px' };

const inputStyle: React.CSSProperties = {
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

// ─── Toggle switch ────────────────────────────────────────────────────────────

interface MiniToggleProps {
  checked: boolean;
  label: string;
  onChange: (v: boolean) => void;
}

function MiniToggle({ checked, label, onChange }: MiniToggleProps): React.ReactElement {
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

// ─── Knob rows ────────────────────────────────────────────────────────────────

interface KnobRowProps {
  label: string;
  help: string;
  control: React.ReactNode;
}

function KnobRow({ label, help, control }: KnobRowProps): React.ReactElement {
  return (
    <div style={rowStyle}>
      <div style={labelColStyle}>
        <div className="text-text-semantic-primary" style={labelTextStyle}>{label}</div>
        <div className="text-text-semantic-muted" style={helpTextStyle}>{help}</div>
      </div>
      {control}
    </div>
  );
}

const CONFIDENCE_OPTIONS: Array<{ value: PatternConfidence; label: string }> = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

function ConfidenceRadioGroup({ value, onChange }: {
  value: PatternConfidence;
  onChange: (v: PatternConfidence) => void;
}): React.ReactElement {
  return (
    <div role="radiogroup" aria-label="Minimum pattern confidence" style={{ display: 'flex', gap: '12px', flexShrink: 0 }}>
      {CONFIDENCE_OPTIONS.map((opt) => (
        <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
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

// ─── Floor slider control ─────────────────────────────────────────────────────

function FloorSlider({ value, onChange }: { value: number; onChange: (v: number) => void }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
      <input max={1.0} min={0.0} step={0.1} style={{ width: '100px' }} type="range" value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
      <span className="text-text-semantic-secondary" style={{ fontSize: '12px', width: '28px', textAlign: 'right' }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

// ─── Latency number input ─────────────────────────────────────────────────────

function LatencyInput({ value, onChange }: { value: number; onChange: (v: number) => void }): React.ReactElement {
  return (
    <input max={5000} min={100} step={100} style={inputStyle} type="number" value={value}
      onChange={(e) => onChange(Math.max(100, Math.min(5000, Number(e.target.value))))} />
  );
}

// ─── Knob panel (expanded body) ──────────────────────────────────────────────

interface KnobPanelProps {
  settings: ResearchSettingsRecord;
  onUpdate: (patch: Partial<ResearchSettingsRecord>) => void;
}

function KnobPanel({ settings, onUpdate }: KnobPanelProps): React.ReactElement {
  const floor = settings.stalenessConfidenceFloor ?? 0.0;
  const factClaimEnabled = settings.factClaimEnabled ?? true;
  const minConf: PatternConfidence = settings.factClaimMinPatternConfidence ?? 'medium';
  const dryRun = settings.preEditDryRunOnly ?? false;
  const latency = settings.maxLatencyMs ?? 800;
  return (
    <div style={{ marginTop: '12px' }}>
      <p className="text-text-semantic-muted" style={{ fontSize: '11px', margin: '0 0 12px' }}>
        Changes apply immediately to new sessions.
      </p>
      <KnobRow
        label="Staleness confidence floor"
        help="Curated entries below this confidence are treated as not-stale. 0.0 = include all."
        control={<FloorSlider value={floor} onChange={(v) => onUpdate({ stalenessConfidenceFloor: v })} />}
      />
      <KnobRow
        label="Fact-claim detector"
        help="When off, stream pausing is skipped but observation telemetry still fires."
        control={<MiniToggle checked={factClaimEnabled} label="Enable fact-claim detector" onChange={(v) => onUpdate({ factClaimEnabled: v })} />}
      />
      <KnobRow
        label="Min pattern confidence"
        help="Patterns below this level are ignored by the fact-claim detector."
        control={<ConfidenceRadioGroup value={minConf} onChange={(v) => onUpdate({ factClaimMinPatternConfidence: v })} />}
      />
      <KnobRow
        label="Pre-edit dry-run mode"
        help="Records what research WOULD fire but skips the actual subagent call."
        control={<MiniToggle checked={dryRun} label="Pre-edit dry-run mode" onChange={(v) => onUpdate({ preEditDryRunOnly: v })} />}
      />
      <KnobRow
        label="Max latency (ms)"
        help="Stream pause budget for fact-claim research. 100–5000ms."
        control={<LatencyInput value={latency} onChange={(v) => onUpdate({ maxLatencyMs: v })} />}
      />
    </div>
  );
}

// ─── ResearchSettingsAdvanced ─────────────────────────────────────────────────

export function ResearchSettingsAdvanced({
  settings,
  onUpdate,
}: ResearchSettingsAdvancedProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  return (
    <section style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
      <button
        className="text-text-semantic-primary"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '6px', width: '100%', textAlign: 'left' }}
        type="button"
        onClick={() => setExpanded((v) => !v)}
      >
        <span style={{ fontSize: '11px' }}>{expanded ? '▾' : '▸'}</span>
        <SectionLabel style={{ marginBottom: 0 }}>Advanced — tuning knobs</SectionLabel>
      </button>
      {expanded && <KnobPanel settings={settings} onUpdate={onUpdate} />}
    </section>
  );
}
