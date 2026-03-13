/**
 * GeneralBackupSubsection.tsx — Import/export, settings.json, updates, crash logs.
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { AppConfig } from '../../types/electron';
import { useToast } from './useToast';
import { ToastBanner } from './ToastBanner';
import { SectionLabel, buttonStyle } from './settingsStyles';

interface Props {
  onImport?: (imported: AppConfig) => void;
}

export function BackupSubsection({ onImport }: Props): React.ReactElement {
  const [toast, showToast] = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isOpeningFile, setIsOpeningFile] = useState(false);

  return (
    <>
      <ToastBanner toast={toast} />
      <ExportImportSection
        isExporting={isExporting} setIsExporting={setIsExporting}
        isImporting={isImporting} setIsImporting={setIsImporting}
        showToast={showToast} onImport={onImport}
      />
      <OpenSettingsFileSection
        isOpeningFile={isOpeningFile} setIsOpeningFile={setIsOpeningFile}
        showToast={showToast}
      />
      <UpdatesSection showToast={showToast} />
      <CrashLogsSection showToast={showToast} />
    </>
  );
}

function ExportImportSection({ isExporting, setIsExporting, isImporting, setIsImporting, showToast, onImport }: {
  isExporting: boolean; setIsExporting: (v: boolean) => void;
  isImporting: boolean; setIsImporting: (v: boolean) => void;
  showToast: (msg: string, kind: 'success' | 'error') => void;
  onImport?: (imported: AppConfig) => void;
}): React.ReactElement {
  async function handleExport(): Promise<void> {
    setIsExporting(true);
    try {
      const result = await window.electronAPI.config.export();
      if (result.cancelled) return;
      if (!result.success) { showToast(result.error ?? 'Export failed.', 'error'); return; }
      showToast('Settings exported successfully.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed.', 'error');
    } finally { setIsExporting(false); }
  }

  async function handleImport(): Promise<void> {
    setIsImporting(true);
    try {
      const result = await window.electronAPI.config.import();
      if (result.cancelled) return;
      if (!result.success) { showToast(result.error ?? 'Import failed.', 'error'); return; }
      showToast('Settings imported successfully.', 'success');
      if (result.config && onImport) onImport(result.config);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Import failed.', 'error');
    } finally { setIsImporting(false); }
  }

  return (
    <section>
      <SectionLabel>Settings Backup</SectionLabel>
      <p style={descStyle}>Export or import settings as JSON.</p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button onClick={() => void handleExport()} disabled={isExporting} style={actionBtn(isExporting)}>
          {isExporting ? 'Exporting...' : 'Export Settings'}
        </button>
        <button onClick={() => void handleImport()} disabled={isImporting} style={actionBtn(isImporting)}>
          {isImporting ? 'Importing...' : 'Import Settings'}
        </button>
      </div>
    </section>
  );
}

function OpenSettingsFileSection({ isOpeningFile, setIsOpeningFile, showToast }: {
  isOpeningFile: boolean; setIsOpeningFile: (v: boolean) => void;
  showToast: (msg: string, kind: 'success' | 'error') => void;
}): React.ReactElement {
  async function handleOpen(): Promise<void> {
    setIsOpeningFile(true);
    try {
      const result = await window.electronAPI.config.openSettingsFile();
      if (!result.success) showToast(result.error ?? 'Failed to open settings file.', 'error');
      else showToast('settings.json opened in your editor.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to open settings file.', 'error');
    } finally { setIsOpeningFile(false); }
  }

  return (
    <section>
      <SectionLabel>Power User</SectionLabel>
      <p style={descStyle}>
        Open <code style={codeStyle}>settings.json</code> in your system editor.
      </p>
      <button onClick={() => void handleOpen()} disabled={isOpeningFile} style={actionBtn(isOpeningFile)}>
        {isOpeningFile ? 'Opening...' : 'Open settings.json'}
      </button>
    </section>
  );
}

function UpdatesSection({ showToast }: {
  showToast: (msg: string, kind: 'success' | 'error') => void;
}): React.ReactElement {
  const [isChecking, setIsChecking] = useState(false);

  const handleCheck = useCallback(async (): Promise<void> => {
    if (!('electronAPI' in window)) return;
    setIsChecking(true);
    try {
      const result = await window.electronAPI.updater.check();
      if (!result.success) showToast(result.error ?? 'Update check failed.', 'error');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update check failed.', 'error');
    } finally { setIsChecking(false); }
  }, [showToast]);

  return (
    <section>
      <SectionLabel>Updates</SectionLabel>
      <p style={descStyle}>Check for a new version of Ouroboros.</p>
      <button onClick={() => void handleCheck()} disabled={isChecking} style={actionBtn(isChecking)}>
        {isChecking ? 'Checking...' : 'Check for Updates'}
      </button>
    </section>
  );
}

function CrashLogsSection({ showToast }: {
  showToast: (msg: string, kind: 'success' | 'error') => void;
}): React.ReactElement {
  const [count, setCount] = useState(0);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    if (!('electronAPI' in window)) return;
    void window.electronAPI.crash.getCrashLogs().then((r) => {
      if (r.success) setCount(r.logs?.length ?? 0);
    });
  }, []);

  async function handleClear(): Promise<void> {
    setIsClearing(true);
    try {
      const r = await window.electronAPI.crash.clearCrashLogs();
      if (r.success) { setCount(0); showToast('Crash logs cleared.', 'success'); }
      else showToast(r.error ?? 'Failed to clear crash logs.', 'error');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed.', 'error');
    } finally { setIsClearing(false); }
  }

  return (
    <section>
      <SectionLabel>Crash Logs</SectionLabel>
      <p style={descStyle}>
        {count === 0 ? 'No crash logs on record.' : `${count} crash log${count !== 1 ? 's' : ''} recorded.`}
      </p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button onClick={() => void window.electronAPI.crash.openCrashLogDir()} style={buttonStyle}>
          View Crash Logs
        </button>
        {count > 0 && (
          <button onClick={() => void handleClear()} disabled={isClearing} style={dangerBtn(isClearing)}>
            {isClearing ? 'Clearing...' : 'Clear Logs'}
          </button>
        )}
      </div>
    </section>
  );
}

const descStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' };
const codeStyle: React.CSSProperties = { fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' };

function actionBtn(disabled: boolean): React.CSSProperties {
  return { ...buttonStyle, opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer' };
}

function dangerBtn(disabled: boolean): React.CSSProperties {
  return {
    ...buttonStyle, color: 'var(--error)', borderColor: 'var(--error)', background: 'transparent',
    opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
