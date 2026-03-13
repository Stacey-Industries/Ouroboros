import React from 'react';
import type { AppConfig } from '../../types/electron';
import { SectionLabel } from './settingsStyles';
import { HooksStatusSubsection } from './HooksStatusSubsection';
import { ApprovalSubsection } from './HooksApprovalSubsection';

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
      <p style={descStyle}>Port for the TCP hook server (macOS/Linux). Range: 1024-65535.</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <input type="number" min={1024} max={65535} value={draft.hooksServerPort}
          onChange={handlePortChange} aria-label="TCP hooks server port" style={portInputStyle}
        />
        {draft.hooksServerPort !== 3333 && (
          <button onClick={() => onChange('hooksServerPort', 3333)} style={resetBtnStyle}>Reset to 3333</button>
        )}
      </div>
      <p style={{ fontSize: '11px', color: 'var(--warning)', marginTop: '8px' }}>
        A restart is required for port changes to take effect.
      </p>
    </section>
  );
}

function HookScriptsLocation(): React.ReactElement {
  return (
    <section>
      <SectionLabel>Hook Scripts Location</SectionLabel>
      <div style={locationBoxStyle}>~/.claude/hooks/</div>
    </section>
  );
}

const descStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' };

const portInputStyle: React.CSSProperties = {
  width: '100px', padding: '7px 10px', borderRadius: '6px',
  border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
  color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-mono)', outline: 'none',
};

const resetBtnStyle: React.CSSProperties = {
  padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer',
};

const locationBoxStyle: React.CSSProperties = {
  padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
};
