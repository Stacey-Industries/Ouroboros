/**
 * AdvancedInferenceControls.tsx — Per-request inference override panel (Wave 26 Phase C).
 *
 * A collapsible panel opened by a "⚙" gear button in the composer.
 * Allows per-request overrides for temperature, max tokens, JSON mode, and stop sequences.
 * Overrides are NOT saved to the profile — they apply only to the current message.
 *
 * Threads through ChatOverrides (extended with inference fields in Phase C).
 */

import React, { useCallback, useState } from 'react';

import type { ChatOverrides } from './ChatControlsBar';

// ─── Inference override subset ────────────────────────────────────────────────

export interface InferenceOverrides {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  jsonSchema?: string | null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TemperatureSlider(props: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}): React.ReactElement {
  const display = props.value !== undefined ? props.value.toFixed(2) : '—';
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between text-[11px] text-text-semantic-secondary">
        <span>Temperature</span>
        <span className="text-text-semantic-muted" style={{ fontFamily: 'var(--font-mono)' }}>
          {display}
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={props.value ?? 1}
        onChange={(e) => props.onChange(parseFloat(e.target.value))}
        className="w-full accent-interactive-accent"
      />
    </label>
  );
}

function MaxTokensInput(props: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}): React.ReactElement {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-text-semantic-secondary">Max tokens</span>
      <input
        type="number"
        min={1}
        max={200000}
        placeholder="Provider default"
        value={props.value ?? ''}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          props.onChange(isNaN(n) ? undefined : n);
        }}
        className="rounded border border-border-subtle bg-surface-inset px-2 py-1 text-[11px] text-text-semantic-primary outline-none focus:border-border-accent"
        style={{ fontFamily: 'var(--font-mono)' }}
      />
    </label>
  );
}

function JsonModeCheckbox(props: {
  value: string | null | undefined;
  onChange: (v: string | null | undefined) => void;
}): React.ReactElement {
  const enabled = props.value !== undefined && props.value !== null;
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[11px] text-text-semantic-secondary">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => props.onChange(e.target.checked ? '' : undefined)}
        className="accent-interactive-accent"
      />
      JSON mode
      {enabled && (
        <input
          type="text"
          placeholder="Schema (optional)"
          value={props.value ?? ''}
          onChange={(e) => props.onChange(e.target.value || '')}
          className="ml-1 flex-1 rounded border border-border-subtle bg-surface-inset px-2 py-0.5 text-[11px] text-text-semantic-primary outline-none focus:border-border-accent"
          style={{ fontFamily: 'var(--font-mono)' }}
        />
      )}
    </label>
  );
}

function StopSequencesInput(props: {
  value: string[] | undefined;
  onChange: (v: string[] | undefined) => void;
}): React.ReactElement {
  const raw = props.value?.join(', ') ?? '';
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-text-semantic-secondary">
        Stop sequences (comma-separated)
      </span>
      <input
        type="text"
        placeholder="e.g. ###, <|end|>"
        value={raw}
        onChange={(e) => {
          const parts = e.target.value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          props.onChange(parts.length > 0 ? parts : undefined);
        }}
        className="rounded border border-border-subtle bg-surface-inset px-2 py-1 text-[11px] text-text-semantic-primary outline-none focus:border-border-accent"
        style={{ fontFamily: 'var(--font-mono)' }}
      />
    </label>
  );
}

// ─── GearIcon ─────────────────────────────────────────────────────────────────

function GearIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path
        d="M6.5 8.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M10.5 6.5h.5M2 6.5h.5M6.5 2v.5M6.5 10v.5M9.2 3.8l-.36.36M4.16 8.84l-.36.36M9.2 9.2l-.36-.36M4.16 4.16l-.36-.36"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── AdvancedInferenceControls ────────────────────────────────────────────────

export interface AdvancedInferenceControlsProps {
  overrides: ChatOverrides;
  onChange: (overrides: ChatOverrides) => void;
}

function hasActiveInferenceOverrides(overrides: ChatOverrides): boolean {
  return (
    overrides.temperature !== undefined ||
    overrides.maxTokens !== undefined ||
    (overrides.stopSequences?.length ?? 0) > 0 ||
    overrides.jsonSchema !== undefined
  );
}

function InferencePanelBody(props: {
  overrides: ChatOverrides;
  patch: (update: Partial<InferenceOverrides>) => void;
  onReset: () => void;
}): React.ReactElement {
  const { overrides, patch, onReset } = props;
  return (
    <div
      className="absolute bottom-full right-0 z-50 mb-1 flex flex-col gap-3 rounded-lg border border-border-semantic bg-surface-panel p-3 shadow-lg"
      style={{ minWidth: '260px' }}
      data-testid="advanced-inference-panel"
    >
      <span className="text-[11px] font-medium text-text-semantic-muted" style={{ fontFamily: 'var(--font-ui)' }}>
        Per-request overrides (not saved to profile)
      </span>
      <TemperatureSlider value={overrides.temperature} onChange={(temperature) => patch({ temperature })} />
      <MaxTokensInput value={overrides.maxTokens} onChange={(maxTokens) => patch({ maxTokens })} />
      <JsonModeCheckbox value={overrides.jsonSchema} onChange={(jsonSchema) => patch({ jsonSchema })} />
      <StopSequencesInput value={overrides.stopSequences} onChange={(stopSequences) => patch({ stopSequences })} />
      <button
        type="button"
        onClick={onReset}
        className="mt-1 self-end text-[10px] text-text-semantic-faint transition-colors hover:text-text-semantic-muted"
        style={{ fontFamily: 'var(--font-ui)' }}
      >
        Reset overrides
      </button>
    </div>
  );
}

export function AdvancedInferenceControls({
  overrides,
  onChange,
}: AdvancedInferenceControlsProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const hasOverrides = hasActiveInferenceOverrides(overrides);

  const patch = useCallback(
    (update: Partial<InferenceOverrides>) => onChange({ ...overrides, ...update }),
    [overrides, onChange],
  );

  const resetOverrides = useCallback(() => {
    onChange({ ...overrides, temperature: undefined, maxTokens: undefined, stopSequences: undefined, jsonSchema: undefined });
  }, [overrides, onChange]);

  const btnClass = [
    'flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors duration-150',
    hasOverrides ? 'text-interactive-accent' : 'text-text-semantic-muted hover:text-text-semantic-primary',
    open ? 'bg-surface-hover' : 'hover:bg-surface-hover',
  ].join(' ');

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Advanced inference controls"
        aria-expanded={open}
        className={btnClass}
        style={{ fontFamily: 'var(--font-ui)' }}
      >
        <GearIcon />
        {hasOverrides && <span className="h-1.5 w-1.5 rounded-full bg-interactive-accent" />}
      </button>
      {open && <InferencePanelBody overrides={overrides} patch={patch} onReset={resetOverrides} />}
    </div>
  );
}
