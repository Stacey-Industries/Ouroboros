import React, { useCallback, useEffect, useState } from 'react';
import type { AppConfig } from '../../types/electron';
import { ToggleSwitch } from './ToggleSwitch';

interface GeneralSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  /** Called after a successful import so the modal can reload the draft */
  onImport?: (imported: AppConfig) => void;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastState {
  message: string;
  kind: 'success' | 'error';
}

function useToast(): [ToastState | null, (msg: string, kind: ToastState['kind']) => void] {
  const [toast, setToast] = useState<ToastState | null>(null);

  function show(message: string, kind: ToastState['kind']): void {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
  }

  return [toast, show];
}

// ─── GeneralSection ───────────────────────────────────────────────────────────

export function GeneralSection({ draft, onChange, onImport }: GeneralSectionProps): React.ReactElement {
  const [toast, showToast] = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isOpeningFile, setIsOpeningFile] = useState(false);

  // ── Auto-update state ────────────────────────────────────────────────────
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const handleCheckForUpdates = useCallback(async (): Promise<void> => {
    if (!('electronAPI' in window)) return;
    setIsCheckingUpdate(true);
    try {
      const result = await window.electronAPI.updater.check();
      if (!result.success) {
        showToast(result.error ?? 'Update check failed.', 'error');
      }
      // Actual result shown via toast from useUpdater hook in App.tsx
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update check failed.', 'error');
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [showToast]);

  // ── Crash log state ──────────────────────────────────────────────────────
  const [crashLogCount, setCrashLogCount] = useState<number>(0);
  const [isClearingLogs, setIsClearingLogs] = useState(false);

  // Load crash log count when section mounts
  useEffect(() => {
    if (!('electronAPI' in window)) return;
    void window.electronAPI.crash.getCrashLogs().then((result) => {
      if (result.success) {
        setCrashLogCount(result.logs?.length ?? 0);
      }
    });
  }, []);

  const handleOpenCrashLogs = useCallback(async (): Promise<void> => {
    if (!('electronAPI' in window)) return;
    await window.electronAPI.crash.openCrashLogDir();
  }, []);

  const handleClearCrashLogs = useCallback(async (): Promise<void> => {
    if (!('electronAPI' in window)) return;
    setIsClearingLogs(true);
    try {
      const result = await window.electronAPI.crash.clearCrashLogs();
      if (result.success) {
        setCrashLogCount(0);
        showToast('Crash logs cleared.', 'success');
      } else {
        showToast(result.error ?? 'Failed to clear crash logs.', 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to clear crash logs.', 'error');
    } finally {
      setIsClearingLogs(false);
    }
  }, [showToast]);

  async function handlePickFolder(): Promise<void> {
    const result = await window.electronAPI.files.selectFolder();
    if (!result.cancelled && result.path) {
      onChange('defaultProjectRoot', result.path);
    }
  }

  function handleClearRecent(): void {
    onChange('recentProjects', []);
  }

  // ── Export ────────────────────────────────────────────────────────────────

  async function handleExport(): Promise<void> {
    setIsExporting(true);
    try {
      const result = await window.electronAPI.config.export();
      if (result.cancelled) return;
      if (!result.success) {
        showToast(result.error ?? 'Export failed.', 'error');
        return;
      }
      showToast('Settings exported successfully.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed.', 'error');
    } finally {
      setIsExporting(false);
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────

  async function handleImport(): Promise<void> {
    setIsImporting(true);
    try {
      const result = await window.electronAPI.config.import();
      if (result.cancelled) return;
      if (!result.success) {
        showToast(result.error ?? 'Import failed.', 'error');
        return;
      }
      showToast('Settings imported successfully.', 'success');
      if (result.config && onImport) {
        onImport(result.config);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Import failed.', 'error');
    } finally {
      setIsImporting(false);
    }
  }

  // ── Open settings.json ────────────────────────────────────────────────────

  async function handleOpenSettingsFile(): Promise<void> {
    setIsOpeningFile(true);
    try {
      const result = await window.electronAPI.config.openSettingsFile();
      if (!result.success) {
        showToast(result.error ?? 'Failed to open settings file.', 'error');
      } else {
        showToast('settings.json opened in your editor. Changes sync automatically.', 'success');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to open settings file.', 'error');
    } finally {
      setIsOpeningFile(false);
    }
  }

  const recentProjects = draft.recentProjects ?? [];
  const defaultRoot = draft.defaultProjectRoot ?? '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Toast notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: '10px 14px',
            borderRadius: '6px',
            border: `1px solid ${toast.kind === 'success' ? 'var(--success)' : 'var(--error)'}`,
            background: toast.kind === 'success'
              ? 'color-mix(in srgb, var(--success) 10%, var(--bg-secondary))'
              : 'color-mix(in srgb, var(--error) 10%, var(--bg-secondary))',
            fontSize: '12px',
            color: toast.kind === 'success' ? 'var(--success)' : 'var(--error)',
            fontWeight: 500,
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Default project root */}
      <section>
        <SectionLabel>Default Project Folder</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          The folder Agent IDE opens by default when no project is loaded.
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <div
            style={{
              flex: 1,
              padding: '7px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-tertiary)',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              color: defaultRoot ? 'var(--text-secondary)' : 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
            title={defaultRoot || 'Not set'}
          >
            {defaultRoot || 'Not set'}
          </div>
          <button
            onClick={() => void handlePickFolder()}
            style={buttonStyle}
          >
            Browse…
          </button>
        </div>
      </section>

      {/* Recent projects */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <SectionLabel style={{ marginBottom: 0 }}>Recent Projects</SectionLabel>
          {recentProjects.length > 0 && (
            <button
              onClick={handleClearRecent}
              style={{
                ...buttonStyle,
                fontSize: '11px',
                padding: '4px 8px',
                color: 'var(--error)',
                borderColor: 'var(--error)',
                background: 'transparent',
              }}
            >
              Clear all
            </button>
          )}
        </div>

        {recentProjects.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No recent projects.
          </p>
        ) : (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: '6px',
              overflow: 'hidden',
            }}
          >
            {recentProjects.map((project, idx) => (
              <div
                key={project}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderBottom: idx < recentProjects.length - 1 ? '1px solid var(--border)' : 'none',
                  background: 'var(--bg-tertiary)',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                  title={project}
                >
                  {project}
                </span>
                <button
                  aria-label={`Remove ${project}`}
                  onClick={() => onChange('recentProjects', recentProjects.filter((p) => p !== project))}
                  style={{
                    flexShrink: 0,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    fontSize: '14px',
                    lineHeight: 1,
                    padding: '0 2px',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Auto-install hooks */}
      <section>
        <ToggleSwitch
          checked={draft.autoInstallHooks}
          onChange={(val) => onChange('autoInstallHooks', val)}
          label="Auto-install hook scripts"
          description="Automatically copies Claude Code hook scripts to ~/.claude/hooks/ on launch so Agent IDE receives live tool events."
        />
      </section>

      {/* Import / Export settings */}
      <section>
        <SectionLabel>Settings Backup</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Export your settings to a JSON file or import settings from a previously exported file.
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => void handleExport()}
            disabled={isExporting}
            style={{
              ...buttonStyle,
              opacity: isExporting ? 0.6 : 1,
              cursor: isExporting ? 'not-allowed' : 'pointer',
            }}
          >
            {isExporting ? 'Exporting…' : 'Export Settings'}
          </button>
          <button
            onClick={() => void handleImport()}
            disabled={isImporting}
            style={{
              ...buttonStyle,
              opacity: isImporting ? 0.6 : 1,
              cursor: isImporting ? 'not-allowed' : 'pointer',
            }}
          >
            {isImporting ? 'Importing…' : 'Import Settings'}
          </button>
        </div>
      </section>

      {/* Open settings.json */}
      <section>
        <SectionLabel>Power User</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Open <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>settings.json</code> in
          your system editor. Changes to the file are applied automatically.
        </p>
        <button
          onClick={() => void handleOpenSettingsFile()}
          disabled={isOpeningFile}
          style={{
            ...buttonStyle,
            opacity: isOpeningFile ? 0.6 : 1,
            cursor: isOpeningFile ? 'not-allowed' : 'pointer',
          }}
        >
          {isOpeningFile ? 'Opening…' : 'Open settings.json'}
        </button>
      </section>

      {/* Auto-update */}
      <section>
        <SectionLabel>Updates</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Check for a new version of Agent IDE. Updates are downloaded automatically when available.
        </p>
        <button
          onClick={() => void handleCheckForUpdates()}
          disabled={isCheckingUpdate}
          style={{
            ...buttonStyle,
            opacity: isCheckingUpdate ? 0.6 : 1,
            cursor: isCheckingUpdate ? 'not-allowed' : 'pointer',
          }}
        >
          {isCheckingUpdate ? 'Checking\u2026' : 'Check for Updates'}
        </button>
      </section>

      {/* Crash logs */}
      <section>
        <SectionLabel>Crash Logs</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          {crashLogCount === 0
            ? 'No crash logs on record.'
            : `${crashLogCount} crash log${crashLogCount !== 1 ? 's' : ''} recorded. Open the folder to inspect them.`}
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => void handleOpenCrashLogs()}
            style={buttonStyle}
          >
            View Crash Logs
          </button>
          {crashLogCount > 0 && (
            <button
              onClick={() => void handleClearCrashLogs()}
              disabled={isClearingLogs}
              style={{
                ...buttonStyle,
                color: 'var(--error)',
                borderColor: 'var(--error)',
                background: 'transparent',
                opacity: isClearingLogs ? 0.6 : 1,
                cursor: isClearingLogs ? 'not-allowed' : 'pointer',
              }}
            >
              {isClearingLogs ? 'Clearing\u2026' : 'Clear Logs'}
            </button>
          )}
        </div>
      </section>

    </div>
  );
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}): React.ReactElement {
  return (
    <div
      style={{
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-muted)',
        marginBottom: '8px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '7px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text)',
  fontSize: '12px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
