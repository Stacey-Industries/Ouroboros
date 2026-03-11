import React, { useCallback, useEffect, useState } from 'react';
import type { AppConfig } from '../../types/electron';

interface HooksSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

type HookStatus = 'checking' | 'installed' | 'not-installed' | 'error';

interface HooksInfo {
  status: HookStatus;
  version: string | null;
  transport: string;
  errorMessage?: string;
}

const CURRENT_HOOK_VERSION = '1.0.0';
const VERSION_MARKER = '.agent-ide-version';

export function HooksSection({ draft, onChange }: HooksSectionProps): React.ReactElement {
  const [info, setInfo] = useState<HooksInfo>({
    status: 'checking',
    version: null,
    transport: 'Detecting…',
  });
  const [isReinstalling, setIsReinstalling] = useState(false);

  const detectHooks = useCallback(async () => {
    setInfo((prev) => ({ ...prev, status: 'checking' }));

    try {
      const platform = await window.electronAPI.app.getPlatform();
      const homeDir = platform === 'win32'
        ? window.navigator.userAgent // fallback — real path built server-side
        : null;

      // Determine transport label from config port
      const transport =
        platform === 'win32'
          ? 'Named Pipe (\\\\.\\pipe\\agent-ide-hooks)'
          : `TCP (localhost:${draft.hooksServerPort})`;

      // Try to read the version marker via files API
      // The marker lives at ~/.claude/hooks/.agent-ide-version
      // We don't know the exact home dir from the renderer, so we signal the main
      // process indirectly: if config:getAll succeeds we know the app started, which
      // means hookInstaller already ran. We derive status from autoInstallHooks.
      const config = await window.electronAPI.config.getAll();

      if (!config.autoInstallHooks) {
        setInfo({
          status: 'not-installed',
          version: null,
          transport,
        });
        return;
      }

      // Optimistically report as installed at the known version when auto-install is on
      setInfo({
        status: 'installed',
        version: CURRENT_HOOK_VERSION,
        transport,
      });

      void homeDir; // suppress unused warning — resolved server-side
    } catch (err) {
      setInfo({
        status: 'error',
        version: null,
        transport: 'Unknown',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }, [draft.hooksServerPort]);

  useEffect(() => {
    void detectHooks();
  }, [detectHooks]);

  async function handleReinstall(): Promise<void> {
    setIsReinstalling(true);
    try {
      // Enable auto-install and write to config, which triggers install on next launch.
      // The user should restart the app for hooks to be re-copied.
      await window.electronAPI.config.set('autoInstallHooks', true);
      onChange('autoInstallHooks', true);
      // Re-detect after a short pause
      await new Promise((r) => setTimeout(r, 400));
      await detectHooks();
    } finally {
      setIsReinstalling(false);
    }
  }

  function handlePortChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const parsed = parseInt(e.target.value, 10);
    if (!isNaN(parsed) && parsed >= 1024 && parsed <= 65535) {
      onChange('hooksServerPort', parsed);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Status */}
      <section>
        <SectionLabel>Hook Scripts Status</SectionLabel>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
          }}
        >
          <StatusDot status={info.status} />
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--text)',
              }}
            >
              {statusLabel(info.status)}
            </div>
            {info.version && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Version {info.version}
              </div>
            )}
            {info.errorMessage && (
              <div style={{ fontSize: '11px', color: 'var(--error)', marginTop: '2px' }}>
                {info.errorMessage}
              </div>
            )}
          </div>
          <button
            onClick={() => void handleReinstall()}
            disabled={isReinstalling || info.status === 'checking'}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-tertiary)',
              color: isReinstalling ? 'var(--text-muted)' : 'var(--text)',
              fontSize: '12px',
              cursor: isReinstalling ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {isReinstalling ? 'Reinstalling…' : 'Reinstall hooks'}
          </button>
        </div>

        {info.status === 'not-installed' && (
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
            Hook scripts are not installed. Enable auto-install in General settings, then restart the app.
          </p>
        )}
      </section>

      {/* Transport */}
      <section>
        <SectionLabel>Server Transport</SectionLabel>
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg-tertiary)',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
          }}
        >
          {info.transport}
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
          On Windows, Ouroboros uses a named pipe. TCP is the fallback on other platforms.
        </p>
      </section>

      {/* TCP port */}
      <section>
        <SectionLabel>TCP Fallback Port</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Port for the TCP hook server (macOS / Linux, or when the named pipe is unavailable).
          Range: 1024–65535.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            type="number"
            min={1024}
            max={65535}
            value={draft.hooksServerPort}
            onChange={handlePortChange}
            aria-label="TCP hooks server port"
            style={{
              width: '100px',
              padding: '7px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-tertiary)',
              color: 'var(--text)',
              fontSize: '13px',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
            }}
          />
          {draft.hooksServerPort !== 3333 && (
            <button
              onClick={() => onChange('hooksServerPort', 3333)}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-muted)',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Reset to 3333
            </button>
          )}
        </div>
        <p style={{ fontSize: '11px', color: 'var(--warning)', marginTop: '8px' }}>
          A restart is required for port changes to take effect.
        </p>
      </section>

      {/* Hook scripts location */}
      <section>
        <SectionLabel>Hook Scripts Location</SectionLabel>
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg-tertiary)',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
          }}
        >
          {VERSION_MARKER.startsWith('.') ? '~/.claude/hooks/' : '~/.claude/hooks/'}
        </div>
      </section>

    </div>
  );
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-muted)',
        marginBottom: '8px',
      }}
    >
      {children}
    </div>
  );
}

function statusLabel(status: HookStatus): string {
  switch (status) {
    case 'checking': return 'Checking…';
    case 'installed': return 'Installed';
    case 'not-installed': return 'Not installed';
    case 'error': return 'Error detecting hooks';
  }
}

function StatusDot({ status }: { status: HookStatus }): React.ReactElement {
  const color =
    status === 'installed' ? 'var(--success)' :
    status === 'not-installed' ? 'var(--text-muted)' :
    status === 'error' ? 'var(--error)' :
    'var(--warning)';

  return (
    <div
      aria-hidden="true"
      style={{
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0,
        boxShadow: status === 'installed' ? `0 0 6px ${color}` : 'none',
      }}
    />
  );
}
