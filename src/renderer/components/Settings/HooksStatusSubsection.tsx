/**
 * HooksStatusSubsection.tsx - Hook status display and transport info.
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
  const { info, isReinstalling, reinstall } = useHooksStatusState(draft.hooksServerPort, () =>
    onChange('autoInstallHooks', true),
  );

  return (
    <>
      <section>
        <SectionLabel>Hook Scripts Status</SectionLabel>
        <StatusCard info={info} isReinstalling={isReinstalling} onReinstall={reinstall} />
        <MissingHooksNote status={info.status} />
      </section>
      <TransportSection transport={info.transport} />
    </>
  );
}

function useHooksStatusState(
  hooksServerPort: number,
  onEnableAutoInstall: () => void,
): { info: HooksInfo; isReinstalling: boolean; reinstall: () => void } {
  const [info, setInfo] = useState<HooksInfo>(defaultHooksInfo);
  const [isReinstalling, setIsReinstalling] = useState(false);
  const refresh = useCallback(async () => {
    setInfo((prev) => ({ ...prev, status: 'checking' }));
    setInfo(await detectHooks(hooksServerPort));
  }, [hooksServerPort]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const reinstall = useCallback(() => {
    void reinstallHooks(setIsReinstalling, refresh, onEnableAutoInstall);
  }, [onEnableAutoInstall, refresh]);

  return { info, isReinstalling, reinstall };
}

async function detectHooks(hooksServerPort: number): Promise<HooksInfo> {
  try {
    const platform = await window.electronAPI.app.getPlatform();
    const transport = getTransport(platform, hooksServerPort);
    const config = await window.electronAPI.config.getAll();
    return config.autoInstallHooks
      ? { status: 'installed', version: CURRENT_HOOK_VERSION, transport }
      : { status: 'not-installed', version: null, transport };
  } catch (err) {
    return {
      status: 'error',
      version: null,
      transport: 'Unknown',
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

async function reinstallHooks(
  setIsReinstalling: React.Dispatch<React.SetStateAction<boolean>>,
  refresh: () => Promise<void>,
  onEnableAutoInstall: () => void,
): Promise<void> {
  setIsReinstalling(true);
  try {
    await window.electronAPI.config.set('autoInstallHooks', true);
    onEnableAutoInstall();
    await wait(400);
    await refresh();
  } finally {
    setIsReinstalling(false);
  }
}

function MissingHooksNote({ status }: { status: HookStatus }): React.ReactElement | null {
  if (status !== 'not-installed') {
    return null;
  }

  return (
    <p className="text-text-semantic-muted" style={noteStyle}>
      Hook scripts are not installed. Enable auto-install in General settings, then restart.
    </p>
  );
}

function StatusCard({
  info,
  isReinstalling,
  onReinstall,
}: {
  info: HooksInfo;
  isReinstalling: boolean;
  onReinstall: () => void;
}): React.ReactElement {
  return (
    <div style={cardStyle}>
      <StatusDot status={info.status} />
      <div style={{ flex: 1 }}>
        <div className="text-text-semantic-primary" style={{ fontSize: '13px', fontWeight: 500 }}>
          {statusLabel(info.status)}
        </div>
        {info.version && (
          <div className="text-text-semantic-muted" style={versionStyle}>
            Version {info.version}
          </div>
        )}
        {info.errorMessage && (
          <div className="text-status-error" style={errorStyle}>
            {info.errorMessage}
          </div>
        )}
      </div>
      <button
        onClick={onReinstall}
        disabled={isReinstalling || info.status === 'checking'}
        style={reinstallBtnStyle(isReinstalling)}
      >
        {isReinstalling ? 'Reinstalling...' : 'Reinstall hooks'}
      </button>
    </div>
  );
}

function TransportSection({ transport }: { transport: string }): React.ReactElement {
  return (
    <section>
      <SectionLabel>Server Transport</SectionLabel>
      <div className="text-text-semantic-secondary" style={transportBoxStyle}>
        {transport}
      </div>
      <p className="text-text-semantic-muted" style={{ fontSize: '11px', marginTop: '6px' }}>
        On Windows, Ouroboros uses a named pipe. TCP is the fallback on other platforms.
      </p>
    </section>
  );
}

function StatusDot({ status }: { status: HookStatus }): React.ReactElement {
  const color =
    status === 'installed'
      ? 'var(--status-success)'
      : status === 'not-installed'
        ? 'var(--text-muted)'
        : status === 'error'
          ? 'var(--status-error)'
          : 'var(--status-warning)';
  return <div aria-hidden="true" style={statusDotStyle(color, status === 'installed')} />;
}

function statusLabel(status: HookStatus): string {
  const labels: Record<HookStatus, string> = {
    checking: 'Checking...',
    installed: 'Installed',
    'not-installed': 'Not installed',
    error: 'Error detecting hooks',
  };
  return labels[status];
}

function getTransport(platform: string, hooksServerPort: number): string {
  return platform === 'win32'
    ? 'Named Pipe (\\\\.\\pipe\\agent-ide-hooks)'
    : `TCP (localhost:${hooksServerPort})`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusDotStyle(color: string, highlight: boolean): React.CSSProperties {
  return {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: color,
    flexShrink: 0,
    boxShadow: highlight ? `0 0 6px ${color}` : 'none',
  };
}

const defaultHooksInfo: HooksInfo = {
  status: 'checking',
  version: null,
  transport: 'Detecting...',
};
const cardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '12px 14px',
  borderRadius: '8px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-panel)',
};
const versionStyle: React.CSSProperties = { fontSize: '11px', marginTop: '2px' };
const errorStyle: React.CSSProperties = { fontSize: '11px', marginTop: '2px' };
const transportBoxStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
};
const noteStyle: React.CSSProperties = { fontSize: '11px', marginTop: '8px' };

function reinstallBtnStyle(isReinstalling: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border-default)',
    background: 'var(--surface-raised)',
    color: isReinstalling ? 'var(--text-muted)' : 'var(--text-primary)',
    fontSize: '12px',
    cursor: isReinstalling ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  };
}
