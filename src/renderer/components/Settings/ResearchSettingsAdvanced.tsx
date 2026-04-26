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
import {
  ConfidenceRadioGroup,
  inputStyle,
  KnobRow,
  MiniToggle,
  type PatternConfidence,
} from './ResearchSettingsAdvancedParts';
import { SectionLabel } from './settingsStyles';

// ─── Types ────────────────────────────────────────────────────────────────────

type ResearchSettingsRecord = NonNullable<AppConfig['researchSettings']>;

export interface ResearchSettingsAdvancedProps {
  settings: ResearchSettingsRecord;
  onUpdate: (patch: Partial<ResearchSettingsRecord>) => void;
}

// ─── Floor slider control ─────────────────────────────────────────────────────

function FloorSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
      <input
        max={1.0}
        min={0.0}
        step={0.1}
        style={{ width: '100px' }}
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span
        className="text-text-semantic-secondary"
        style={{ fontSize: '12px', width: '28px', textAlign: 'right' }}
      >
        {value.toFixed(1)}
      </span>
    </div>
  );
}

// ─── Latency number input ─────────────────────────────────────────────────────

function LatencyInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}): React.ReactElement {
  return (
    <input
      max={5000}
      min={100}
      step={100}
      style={inputStyle}
      type="number"
      value={value}
      onChange={(e) => onChange(Math.max(100, Math.min(5000, Number(e.target.value))))}
    />
  );
}

// ─── Knob panel (expanded body) ──────────────────────────────────────────────

interface KnobPanelProps {
  settings: ResearchSettingsRecord;
  onUpdate: (patch: Partial<ResearchSettingsRecord>) => void;
}

interface KnobPanelBodyProps {
  floor: number;
  factClaimEnabled: boolean;
  minConf: PatternConfidence;
  dryRun: boolean;
  latency: number;
  onUpdate: (patch: Partial<ResearchSettingsRecord>) => void;
}

function KnobPanelBodyTop({
  floor,
  factClaimEnabled,
  minConf,
  onUpdate,
}: Pick<KnobPanelBodyProps, 'floor' | 'factClaimEnabled' | 'minConf' | 'onUpdate'>): React.ReactElement {
  return (
    <>
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
    </>
  );
}

function KnobPanelBodyBottom({
  dryRun,
  latency,
  onUpdate,
}: Pick<KnobPanelBodyProps, 'dryRun' | 'latency' | 'onUpdate'>): React.ReactElement {
  return (
    <>
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
    </>
  );
}

function KnobPanelBody({ floor, factClaimEnabled, minConf, dryRun, latency, onUpdate }: KnobPanelBodyProps): React.ReactElement {
  return (
    <div style={{ marginTop: '12px' }}>
      <p className="text-text-semantic-muted" style={{ fontSize: '11px', margin: '0 0 12px' }}>
        Changes apply immediately to new sessions.
      </p>
      <KnobPanelBodyTop floor={floor} factClaimEnabled={factClaimEnabled} minConf={minConf} onUpdate={onUpdate} />
      <KnobPanelBodyBottom dryRun={dryRun} latency={latency} onUpdate={onUpdate} />
    </div>
  );
}

function KnobPanel({ settings, onUpdate }: KnobPanelProps): React.ReactElement {
  const floor = settings.stalenessConfidenceFloor ?? 0.0;
  const factClaimEnabled = settings.factClaimEnabled ?? true;
  const minConf: PatternConfidence = settings.factClaimMinPatternConfidence ?? 'medium';
  const dryRun = settings.preEditDryRunOnly ?? false;
  const latency = settings.maxLatencyMs ?? 800;
  return (
    <KnobPanelBody floor={floor} factClaimEnabled={factClaimEnabled} minConf={minConf} dryRun={dryRun} latency={latency} onUpdate={onUpdate} />
  );
}

// ─── ResearchSettingsAdvanced ─────────────────────────────────────────────────

export function ResearchSettingsAdvanced({ settings, onUpdate }: ResearchSettingsAdvancedProps): React.ReactElement {
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
