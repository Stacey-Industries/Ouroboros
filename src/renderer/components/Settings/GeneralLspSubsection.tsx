/**
 * GeneralLspSubsection.tsx — LSP settings sub-section.
 */

import React from 'react';

import type { AppConfig } from '../../types/electron';
import { SectionLabel } from './settingsStyles';
import { ToggleSwitch } from './ToggleSwitch';

interface Props {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

export function LspSubsection({ draft, onChange }: Props): React.ReactElement<any> {
  return (
    <section style={{ marginTop: '24px' }}>
      <SectionLabel>Language Server Protocol (LSP)</SectionLabel>
      <p className="text-text-semantic-muted" style={descStyle}>
        Connect to language servers for code intelligence.
      </p>
      <div style={toggleRowStyle}>
        <label className="text-text-semantic-primary" style={{ fontSize: '13px', flex: 1 }}>
          Enable LSP
        </label>
        <ToggleSwitch
          label="Enable LSP"
          checked={draft.lspEnabled ?? false}
          onChange={(v) => onChange('lspEnabled', v)}
        />
      </div>
      {draft.lspEnabled && <LspServersInput draft={draft} onChange={onChange} />}
    </section>
  );
}

function LspServersInput({ draft, onChange }: Props): React.ReactElement<any> {
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>): void {
    const lines = e.target.value.split('\n').filter((l) => l.includes('='));
    const parsed: Record<string, string> = {};
    for (const line of lines) {
      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim();
        if (key && val) parsed[key] = val;
      }
    }
    onChange('lspServers', parsed);
  }

  const value = Object.entries(draft.lspServers ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  return (
    <div style={{ marginTop: '4px' }}>
      <label className="text-text-semantic-muted" style={sublabelStyle}>
        Custom Language Server Commands
      </label>
      <p className="text-text-semantic-faint" style={hintStyle}>
        One entry per line: language=command (e.g. &quot;rust=rust-analyzer&quot;).
      </p>
      <textarea
        value={value}
        onChange={handleChange}
        rows={4}
        className="text-text-semantic-primary"
        style={textareaStyle}
        placeholder={'typescript=typescript-language-server --stdio\npython=pylsp'}
      />
    </div>
  );
}

const descStyle: React.CSSProperties = { fontSize: '12px', marginBottom: '12px', lineHeight: 1.5 };
const toggleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginBottom: '14px',
};
const sublabelStyle: React.CSSProperties = {
  fontSize: '12px',
  display: 'block',
  marginBottom: '6px',
};
const hintStyle: React.CSSProperties = { fontSize: '11px', marginBottom: '8px', lineHeight: 1.4 };

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
};
