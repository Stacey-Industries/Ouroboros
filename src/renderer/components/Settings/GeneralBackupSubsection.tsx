/**
 * GeneralBackupSubsection.tsx - Import/export, settings.json, updates, crash logs.
 *
 * UpdatesSection, CrashLogsSection, and async helpers live in GeneralBackupActions.tsx
 * to keep this file under 300 lines.
 */

import React, { useState } from 'react';

import type { AppConfig } from '../../types/electron';
import {
  CrashLogsSection,
  handleExportSettings,
  handleImportSettings,
  UpdatesSection,
} from './GeneralBackupActions';
import { buttonStyle, SectionLabel } from './settingsStyles';
import { ToastBanner } from './ToastBanner';
import { useToast } from './useToast';

interface Props {
  onImport?: (imported: AppConfig) => void;
}

type ToastFn = (msg: string, kind: 'success' | 'error') => void;
type BusySetter = (busy: boolean) => void;

export function BackupSubsection({ onImport }: Props): React.ReactElement<any> {
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

function ExportImportButtons({
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
}): React.ReactElement<any> {
  return (
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
}): React.ReactElement<any> {
  return (
    <section>
      <SectionLabel>Settings Backup</SectionLabel>
      <p className="text-text-semantic-muted" style={descStyle}>
        Export or import settings as JSON.
      </p>
      <ExportImportButtons
        isExporting={isExporting}
        setIsExporting={setIsExporting}
        isImporting={isImporting}
        setIsImporting={setIsImporting}
        showToast={showToast}
        onImport={onImport}
      />
    </section>
  );
}

async function handleOpenSettingsFile(
  setIsOpeningFile: BusySetter,
  showToast: ToastFn,
): Promise<void> {
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

function OpenSettingsFileSection({
  isOpeningFile,
  setIsOpeningFile,
  showToast,
}: {
  isOpeningFile: boolean;
  setIsOpeningFile: (v: boolean) => void;
  showToast: ToastFn;
}): React.ReactElement<any> {
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
        onClick={() => void handleOpenSettingsFile(setIsOpeningFile, showToast)}
        disabled={isOpeningFile}
        className="text-text-semantic-primary"
        style={actionBtn(isOpeningFile)}
      >
        {isOpeningFile ? 'Opening...' : 'Open settings.json'}
      </button>
    </section>
  );
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
