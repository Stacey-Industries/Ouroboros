/**
 * GeneralBackupSubsection.tsx - Import/export, settings.json, updates, crash logs.
 */

import React, { useCallback, useEffect, useState } from 'react';

import type { AppConfig } from '../../types/electron';
import { buttonStyle, SectionLabel } from './settingsStyles';
import { ToastBanner } from './ToastBanner';
import { useToast } from './useToast';

interface Props {
  onImport?: (imported: AppConfig) => void;
}

type ToastFn = (msg: string, kind: 'success' | 'error') => void;
type BusySetter = (busy: boolean) => void;

export function BackupSubsection({ onImport }: Props): React.ReactElement {
  const [toast, showToast] = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isOpeningFile, setIsOpeningFile] = useState(false);

  return (
    <>
      <ToastBanner toast={toast} />
      <ExportImportSection
        isExporting={isExporting}
        setIsExporting={setIsExporting}
        isImporting={isImporting}
        setIsImporting={setIsImporting}
        showToast={showToast}
        onImport={onImport}
      />
      <OpenSettingsFileSection
        isOpeningFile={isOpeningFile}
        setIsOpeningFile={setIsOpeningFile}
        showToast={showToast}
      />
      <UpdatesSection showToast={showToast} />
      <CrashLogsSection showToast={showToast} />
    </>
  );
}

function ExportImportSection({
  isExporting,
  setIsExporting,
  isImporting,
  setIsImporting,
  showToast,
  onImport,
}: {
  isExporting: boolean;
  setIsExporting: (v: boolean) => void;
  isImporting: boolean;
  setIsImporting: (v: boolean) => void;
  showToast: ToastFn;
  onImport?: (imported: AppConfig) => void;
}): React.ReactElement {
  return (
    <section>
      <SectionLabel>Settings Backup</SectionLabel>
      <p className="text-text-semantic-muted" style={descStyle}>
        Export or import settings as JSON.
      </p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          onClick={() => void handleExportSettings(setIsExporting, showToast)}
          disabled={isExporting}
          className="text-text-semantic-primary"
          style={actionBtn(isExporting)}
        >
          {isExporting ? 'Exporting...' : 'Export Settings'}
        </button>
        <button
          onClick={() => void handleImportSettings(setIsImporting, showToast, onImport)}
          disabled={isImporting}
          className="text-text-semantic-primary"
          style={actionBtn(isImporting)}
        >
          {isImporting ? 'Importing...' : 'Import Settings'}
        </button>
      </div>
    </section>
  );
}

function OpenSettingsFileSection({
  isOpeningFile,
  setIsOpeningFile,
  showToast,
}: {
  isOpeningFile: boolean;
  setIsOpeningFile: (v: boolean) => void;
  showToast: ToastFn;
}): React.ReactElement {
  async function handleOpen(): Promise<void> {
    setIsOpeningFile(true);
    try {
      const result = await window.electronAPI.config.openSettingsFile();
      if (!result.success) showToast(result.error ?? 'Failed to open settings file.', 'error');
      else showToast('settings.json opened in your editor.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to open settings file.', 'error');
    } finally {
      setIsOpeningFile(false);
    }
  }

  return (
    <section>
      <SectionLabel>Power User</SectionLabel>
      <p className="text-text-semantic-muted" style={descStyle}>
        Open{' '}
        <code className="text-text-semantic-secondary" style={codeStyle}>
          settings.json
        </code>{' '}
        in your system editor.
      </p>
      <button
        onClick={() => void handleOpen()}
        disabled={isOpeningFile}
        className="text-text-semantic-primary"
        style={actionBtn(isOpeningFile)}
      >
        {isOpeningFile ? 'Opening...' : 'Open settings.json'}
      </button>
    </section>
  );
}

function UpdatesSection({ showToast }: { showToast: ToastFn }): React.ReactElement {
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

interface BackupActionResult {
  success: boolean;
  error?: string;
  cancelled?: boolean;
}

async function handleExportSettings(setBusy: BusySetter, showToast: ToastFn): Promise<void> {
  await runBackupAction({
    setBusy,
    showToast,
    successMessage: 'Settings exported successfully.',
    failureMessage: 'Export failed.',
    action: () => window.electronAPI.config.export(),
  });
}

async function handleImportSettings(
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
      if (result.config && onImport) {
        onImport(result.config);
      }
    },
  });
}

async function runBackupAction<TResult extends BackupActionResult>({
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

function CrashLogsSection({ showToast }: { showToast: ToastFn }): React.ReactElement {
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
    } else {
      showToast(result.error ?? 'Failed to clear crash logs.', 'error');
    }
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

const descStyle: React.CSSProperties = { fontSize: '12px', marginBottom: '12px' };
const codeStyle: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

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
