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

export function WebAccessSubsection({ draft, onChange }: Props): React.ReactElement {
  return (
    <section>
      <SectionLabel>Web Remote Access</SectionLabel>
      <p style={descStyle}>
        Access Ouroboros from a mobile device or another browser on your network.
      </p>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>Password</label>
        <input
          type="password"
          value={draft.webAccessPassword ?? ''}
          onChange={(e) => onChange('webAccessPassword', e.target.value)}
          placeholder="Set a password for mobile login"
          style={inputStyle}
          autoComplete="new-password"
        />
        <p style={hintStyle}>
          Leave empty to use the auto-generated access token instead.
        </p>
      </div>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>Port</label>
        <input
          type="number"
          value={draft.webAccessPort ?? 7890}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val >= 1024 && val <= 65535) {
              onChange('webAccessPort', val);
            }
          }}
          min={1024}
          max={65535}
          style={{ ...inputStyle, width: '120px' }}
        />
        <p style={hintStyle}>
          Port for the web server (requires restart). Default: 7890.
        </p>
      </div>
    </section>
  );
}

const descStyle: React.CSSProperties = {
  fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.5,
};

const fieldRowStyle: React.CSSProperties = {
  marginBottom: '14px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px',
};

const hintStyle: React.CSSProperties = {
  fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px', lineHeight: 1.4,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', borderRadius: '6px',
  border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
  color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-ui)',
  outline: 'none', boxSizing: 'border-box',
};
