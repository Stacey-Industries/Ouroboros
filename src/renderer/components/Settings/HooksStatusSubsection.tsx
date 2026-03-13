/**
 * HooksStatusSubsection.tsx — Hook status display and transport info.
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { AppConfig } from '../../types/electron';
import { SectionLabel } from './settingsStyles';

type HookStatus = 'checking' | 'installed' | 'not-installed' | 'error';

interface HooksInfo {
  status: HookStatus;
  version: string | null;
  transport: string;
  errorMessage?: string;
}

const CURRENT_HOOK_VERSION = '1.0.0';

interface Props {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

export function HooksStatusSubsection({ draft, onChange }: Props): React.ReactElement {
  const [info, setInfo] = useState<HooksInfo>({ status: 'checking', version: null, transport: 'Detecting...' });
  const [isReinstalling, setIsReinstalling] = useState(false);

  const detectHooks = useCallback(async () => {
    setInfo((prev) => ({ ...prev, status: 'checking' }));
    try {
      const platform = await window.electronAPI.app.getPlatform();
      const transport = platform === 'win32'
        ? 'Named Pipe (\\\\.\\pipe\\agent-ide-hooks)'
        : `TCP (localhost:${draft.hooksServerPort})`;
      const config = await window.electronAPI.config.getAll();
      if (!config.autoInstallHooks) {
        setInfo({ status: 'not-installed', version: null, transport });
        return;
      }
      setInfo({ status: 'installed', version: CURRENT_HOOK_VERSION, transport });
    } catch (err) {
      setInfo({ status: 'error', version: null, transport: 'Unknown', errorMessage: err instanceof Error ? err.message : String(err) });
    }
  }, [draft.hooksServerPort]);

  useEffect(() => { void detectHooks(); }, [detectHooks]);

  async function handleReinstall(): Promise<void> {
    setIsReinstalling(true);
    try {
      await window.electronAPI.config.set('autoInstallHooks', true);
      onChange('autoInstallHooks', true);
      await new Promise((r) => setTimeout(r, 400));
      await detectHooks();
    } finally { setIsReinstalling(false); }
  }

  return (
    <>
      <section>
        <SectionLabel>Hook Scripts Status</SectionLabel>
        <StatusCard info={info} isReinstalling={isReinstalling} onReinstall={() => void handleReinstall()} />
        {info.status === 'not-installed' && (
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
            Hook scripts are not installed. Enable auto-install in General settings, then restart.
          </p>
        )}
      </section>
      <TransportSection transport={info.transport} />
    </>
  );
}

function StatusCard({ info, isReinstalling, onReinstall }: {
  info: HooksInfo; isReinstalling: boolean; onReinstall: () => void;
}): React.ReactElement {
  return (
    <div style={cardStyle}>
      <StatusDot status={info.status} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>{statusLabel(info.status)}</div>
        {info.version && <div style={versionStyle}>Version {info.version}</div>}
        {info.errorMessage && <div style={errorStyle}>{info.errorMessage}</div>}
      </div>
      <button onClick={onReinstall} disabled={isReinstalling || info.status === 'checking'} style={reinstallBtnStyle(isReinstalling)}>
        {isReinstalling ? 'Reinstalling...' : 'Reinstall hooks'}
      </button>
    </div>
  );
}

function TransportSection({ transport }: { transport: string }): React.ReactElement {
  return (
    <section>
      <SectionLabel>Server Transport</SectionLabel>
      <div style={transportBoxStyle}>{transport}</div>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
        On Windows, Ouroboros uses a named pipe. TCP is the fallback on other platforms.
      </p>
    </section>
  );
}

function StatusDot({ status }: { status: HookStatus }): React.ReactElement {
  const color = status === 'installed' ? 'var(--success)' : status === 'not-installed' ? 'var(--text-muted)' : status === 'error' ? 'var(--error)' : 'var(--warning)';
  return <div aria-hidden="true" style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color, flexShrink: 0, boxShadow: status === 'installed' ? `0 0 6px ${color}` : 'none' }} />;
}

function statusLabel(status: HookStatus): string {
  const labels: Record<HookStatus, string> = { checking: 'Checking...', installed: 'Installed', 'not-installed': 'Not installed', error: 'Error detecting hooks' };
  return labels[status];
}

const cardStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)' };
const versionStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' };
const errorStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--error)', marginTop: '2px' };
const transportBoxStyle: React.CSSProperties = { padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' };

function reinstallBtnStyle(isReinstalling: boolean): React.CSSProperties {
  return {
    padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)',
    background: 'var(--bg-tertiary)', color: isReinstalling ? 'var(--text-muted)' : 'var(--text)',
    fontSize: '12px', cursor: isReinstalling ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
  };
}
