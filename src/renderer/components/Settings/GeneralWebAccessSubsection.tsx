/**
 * GeneralWebAccessSubsection.tsx — Web remote access settings (password + port).
 */

import React from 'react';

import type { AppConfig } from '../../types/electron';
import { SectionLabel } from './settingsStyles';

interface Props {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

function PasswordField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}): React.ReactElement {
  return (
    <div style={fieldRowStyle}>
      <label className="text-text-semantic-muted" style={labelStyle}>
        Password
      </label>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Set a password for mobile login"
        className="text-text-semantic-primary"
        style={inputStyle}
        autoComplete="new-password"
      />
      <p className="text-text-semantic-faint" style={hintStyle}>
        Leave empty to use the auto-generated access token instead.
      </p>
    </div>
  );
}

function PortField({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}): React.ReactElement {
  return (
    <div style={fieldRowStyle}>
      <label className="text-text-semantic-muted" style={labelStyle}>
        Port
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const val = parseInt(e.target.value, 10);
          if (!Number.isNaN(val) && val >= 1024 && val <= 65535) onChange(val);
        }}
        min={1024}
        max={65535}
        className="text-text-semantic-primary"
        style={{ ...inputStyle, width: '120px' }}
      />
      <p className="text-text-semantic-faint" style={hintStyle}>
        Port for the web server (requires restart). Default: 7890.
      </p>
    </div>
  );
}

export function WebAccessSubsection({ draft, onChange }: Props): React.ReactElement {
  return (
    <section>
      <SectionLabel>Web Remote Access</SectionLabel>
      <p className="text-text-semantic-muted" style={descStyle}>
        Access Ouroboros from a mobile device or another browser on your network.
      </p>
      <PasswordField
        value={draft.webAccessPassword ?? ''}
        onChange={(v) => onChange('webAccessPassword', v)}
      />
      <PortField
        value={draft.webAccessPort ?? 7890}
        onChange={(v) => onChange('webAccessPort', v)}
      />
    </section>
  );
}

const descStyle: React.CSSProperties = { fontSize: '12px', marginBottom: '12px', lineHeight: 1.5 };
const fieldRowStyle: React.CSSProperties = { marginBottom: '14px' };
const labelStyle: React.CSSProperties = { fontSize: '12px', display: 'block', marginBottom: '6px' };
const hintStyle: React.CSSProperties = { fontSize: '11px', marginTop: '4px', lineHeight: 1.4 };
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '13px',
  fontFamily: 'var(--font-ui)',
  outline: 'none',
  boxSizing: 'border-box',
};
