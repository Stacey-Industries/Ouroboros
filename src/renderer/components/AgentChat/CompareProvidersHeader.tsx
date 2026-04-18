/**
 * CompareProvidersHeader.tsx — Wave 36 Phase F
 *
 * Header bar for the compare-providers panel:
 *   prompt input | A: provider dropdown | B: provider dropdown | Run | Cancel
 */

import React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProviderOption {
  id: string;
  label: string;
}

export interface CompareProvidersHeaderProps {
  prompt: string;
  onPromptChange: (v: string) => void;
  providerIdA: string;
  providerIdB: string;
  onProviderAChange: (id: string) => void;
  onProviderBChange: (id: string) => void;
  providers: ProviderOption[];
  isRunning: boolean;
  onRun: () => void;
  onCancel: () => void;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 12px',
  borderBottom: '1px solid var(--border-subtle)',
  flexShrink: 0,
  flexWrap: 'wrap',
};

const INPUT_STYLE: React.CSSProperties = {
  flex: '1 1 200px',
  padding: '5px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border-semantic)',
  background: 'var(--surface-inset)',
  color: 'var(--text-semantic-primary)',
  fontSize: '13px',
  minWidth: 0,
};

const SELECT_STYLE: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border-semantic)',
  background: 'var(--surface-inset)',
  color: 'var(--text-semantic-primary)',
  fontSize: '13px',
  minWidth: '90px',
};

const BTN_BASE: React.CSSProperties = {
  padding: '5px 12px',
  borderRadius: '4px',
  border: 'none',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
  flexShrink: 0,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ProviderSelectProps {
  label: string;
  value: string;
  providers: ProviderOption[];
  onChange: (id: string) => void;
  disabled: boolean;
}

function ProviderSelect({ label, value, providers, onChange, disabled }: ProviderSelectProps): React.ReactElement {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px',
      color: 'var(--text-semantic-secondary)', flexShrink: 0 }}>
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={SELECT_STYLE}
      >
        <option value="">Select…</option>
        {providers.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
    </label>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CompareProvidersHeader({
  prompt, onPromptChange,
  providerIdA, providerIdB,
  onProviderAChange, onProviderBChange,
  providers, isRunning, onRun, onCancel,
}: CompareProvidersHeaderProps): React.ReactElement {
  const canRun = prompt.trim().length > 0 && providerIdA !== '' && providerIdB !== '';

  return (
    <div style={HEADER_STYLE}>
      <input
        type="text"
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="Enter prompt…"
        disabled={isRunning}
        style={INPUT_STYLE}
        aria-label="Prompt"
      />
      <ProviderSelect label="A:" value={providerIdA} providers={providers}
        onChange={onProviderAChange} disabled={isRunning} />
      <ProviderSelect label="B:" value={providerIdB} providers={providers}
        onChange={onProviderBChange} disabled={isRunning} />
      {isRunning ? (
        <button onClick={onCancel} style={{ ...BTN_BASE,
          background: 'var(--interactive-muted)', color: 'var(--text-semantic-primary)' }}>
          Cancel
        </button>
      ) : (
        <button onClick={onRun} disabled={!canRun} style={{ ...BTN_BASE,
          background: canRun ? 'var(--interactive-accent)' : 'var(--interactive-muted)',
          color: 'var(--text-on-accent)',
          opacity: canRun ? 1 : 0.5,
          cursor: canRun ? 'pointer' : 'not-allowed' }}>
          Run
        </button>
      )}
    </div>
  );
}
