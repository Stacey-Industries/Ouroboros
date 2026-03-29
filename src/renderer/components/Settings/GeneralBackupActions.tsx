/**
 * GeneralBackupActions.tsx — UpdatesSection, CrashLogsSection, and their
 * async helper functions. Split from GeneralBackupSubsection.tsx to keep both
 * files under 300 lines.
 */

import React, { useCallback, useEffect, useState } from 'react';

import type { AppConfig } from '../../types/electron';
import { buttonStyle, SectionLabel } from './settingsStyles';

type ToastFn = (msg: string, kind: 'success' | 'error') => void;
type BusySetter = (busy: boolean) => void;

export interface BackupActionResult {
  success: boolean;
  error?: string;
  cancelled?: boolean;
}

export async function runBackupAction<TResult extends BackupActionResult>({
  setBusy,
  showToast,
  successMessage,
  failureMessage,
  action,
  onSuccess,
}: {
  setBusy: BusySetter;
  showToast: ToastFn;
  successMessage: string;
  failureMessage: string;
  action: () => Promise<TResult>;
  onSuccess?: (result: TResult) => void;
}): Promise<void> {
  setBusy(true);
  try {
    const result = await action();
    if (result.cancelled) return;
    if (!result.success) {
      showToast(result.error ?? failureMessage, 'error');
      return;
    }
    onSuccess?.(result);
    showToast(successMessage, 'success');
  } catch (err) {
    showToast(err instanceof Error ? err.message : failureMessage, 'error');
  } finally {
    setBusy(false);
  }
}

export async function handleExportSettings(setBusy: BusySetter, showToast: ToastFn): Promise<void> {
  await runBackupAction({
    setBusy,
    showToast,
    successMessage: 'Settings exported successfully.',
    failureMessage: 'Export failed.',
    action: () => window.electronAPI.config.export(),
  });
}

export async function handleImportSettings(
  setBusy: BusySetter,
  showToast: ToastFn,
  onImport?: (imported: AppConfig) => void,
): Promise<void> {
  await runBackupAction({
    setBusy,
    showToast,
    successMessage: 'Settings imported successfully.',
    failureMessage: 'Import failed.',
    action: () => window.electronAPI.config.import(),
    onSuccess: (result) => {
      if (result.config && onImport) onImport(result.config);
    },
  });
}

const descStyle: React.CSSProperties = { fontSize: '12px', marginBottom: '12px' };

function actionBtn(disabled: boolean): React.CSSProperties {
  return {
    ...buttonStyle,
    opacity: disabled ? 0.6 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function dangerBtn(disabled: boolean): React.CSSProperties {
  return {
    ...buttonStyle,
    borderColor: 'var(--status-error)',
    background: 'transparent',
    opacity: disabled ? 0.6 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

export function UpdatesSection({ showToast }: { showToast: ToastFn }): React.ReactElement<any> {
  const [isChecking, setIsChecking] = useState(false);

  const handleCheck = useCallback(async (): Promise<void> => {
    if (!('electronAPI' in window)) return;
    setIsChecking(true);
    try {
      const result = await window.electronAPI.updater.check();
      if (!result.success) showToast(result.error ?? 'Update check failed.', 'error');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update check failed.', 'error');
    } finally {
      setIsChecking(false);
    }
  }, [showToast]);

  return (
    <section>
      <SectionLabel>Updates</SectionLabel>
      <p className="text-text-semantic-muted" style={descStyle}>
        Check for a new version of Ouroboros.
      </p>
      <button
        onClick={() => void handleCheck()}
        disabled={isChecking}
        className="text-text-semantic-primary"
        style={actionBtn(isChecking)}
      >
        {isChecking ? 'Checking...' : 'Check for Updates'}
      </button>
    </section>
  );
}

async function clearCrashLogs(
  setIsClearing: BusySetter,
  setCount: React.Dispatch<React.SetStateAction<number>>,
  showToast: ToastFn,
): Promise<void> {
  setIsClearing(true);
  try {
    const result = await window.electronAPI.crash.clearCrashLogs();
    if (result.success) {
      setCount(0);
      showToast('Crash logs cleared.', 'success');
    } else showToast(result.error ?? 'Failed to clear crash logs.', 'error');
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Failed.', 'error');
  } finally {
    setIsClearing(false);
  }
}

function crashLogsSummary(count: number): string {
  return count === 0
    ? 'No crash logs on record.'
    : `${count} crash log${count !== 1 ? 's' : ''} recorded.`;
}

export function CrashLogsSection({ showToast }: { showToast: ToastFn }): React.ReactElement<any> {
  const [count, setCount] = useState(0);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    if (!('electronAPI' in window)) return;
    void window.electronAPI.crash.getCrashLogs().then((result) => {
      if (result.success) setCount(result.logs?.length ?? 0);
    });
  }, []);

  return (
    <section>
      <SectionLabel>Crash Logs</SectionLabel>
      <p className="text-text-semantic-muted" style={descStyle}>
        {crashLogsSummary(count)}
      </p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          onClick={() => void window.electronAPI.crash.openCrashLogDir()}
          className="text-text-semantic-primary"
          style={buttonStyle}
        >
          View Crash Logs
        </button>
        {count > 0 && (
          <button
            onClick={() => void clearCrashLogs(setIsClearing, setCount, showToast)}
            disabled={isClearing}
            className="text-status-error"
            style={dangerBtn(isClearing)}
          >
            {isClearing ? 'Clearing...' : 'Clear Logs'}
          </button>
        )}
      </div>
    </section>
  );
}
