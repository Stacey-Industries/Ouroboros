import React from 'react';

import type { AppConfig } from '../../types/electron';
import { ApprovalSubsection } from './HooksApprovalSubsection';
import { HooksConfigSubsection } from './HooksConfigSubsection';
import { HooksStatusSubsection } from './HooksStatusSubsection';
import { SectionLabel } from './settingsStyles';

interface HooksSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

export function HooksSection({ draft, onChange }: HooksSectionProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <HooksStatusSubsection draft={draft} onChange={onChange} />
      <TcpPortSection draft={draft} onChange={onChange} />
      <HookScriptsLocation />
      <ApprovalSubsection draft={draft} onChange={onChange} />
      <HooksConfigSubsection />
    </div>
  );
}

function TcpPortSection({ draft, onChange }: HooksSectionProps): React.ReactElement {
  function handlePortChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const parsed = parseInt(e.target.value, 10);
    if (!isNaN(parsed) && parsed >= 1024 && parsed <= 65535) {
      onChange('hooksServerPort', parsed);
    }
  }

  return (
    <section>
      <SectionLabel>TCP Fallback Port</SectionLabel>
      <p className="text-text-semantic-muted" style={descStyle}>
        Port for the TCP hook server (macOS/Linux). Range: 1024-65535.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <input
          type="number"
          min={1024}
          max={65535}
          value={draft.hooksServerPort}
          onChange={handlePortChange}
          aria-label="TCP hooks server port"
          className="text-text-semantic-primary"
          style={portInputStyle}
        />
        {draft.hooksServerPort !== 3333 && (
          <button
            onClick={() => onChange('hooksServerPort', 3333)}
            className="text-text-semantic-muted"
            style={resetBtnStyle}
          >
            Reset to 3333
          </button>
        )}
      </div>
      <p className="text-status-warning" style={{ fontSize: '11px', marginTop: '8px' }}>
        A restart is required for port changes to take effect.
      </p>
    </section>
  );
}

function HookScriptsLocation(): React.ReactElement {
  return (
    <section>
      <SectionLabel>Hook Scripts Location</SectionLabel>
      <div className="text-text-semantic-secondary" style={locationBoxStyle}>
        ~/.claude/hooks/
      </div>
    </section>
  );
}

const descStyle: React.CSSProperties = { fontSize: '12px', marginBottom: '10px' };

const portInputStyle: React.CSSProperties = {
  width: '100px',
  padding: '7px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '13px',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
};

const resetBtnStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border-default)',
  background: 'transparent',
  fontSize: '11px',
  cursor: 'pointer',
};

const locationBoxStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
};
