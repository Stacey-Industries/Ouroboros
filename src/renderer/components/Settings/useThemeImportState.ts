/**
 * useThemeImportState.ts — State hook and helpers for ThemeImportModal.
 */

import type React from 'react';
import { useCallback, useState } from 'react';

import { parseVsCodeTheme, type VsCodeThemeImportResult } from '../../themes/vsCodeImport';
import type { AppConfig } from '../../types/electron';
import type { ImportTab } from './ThemeImportModalBody';

export type ModalPhase = 'input' | 'success';
export type ConfigSet = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => Promise<void>;

export interface ImportState {
  activeTab: ImportTab;
  pasteValue: string;
  phase: ModalPhase;
  importResult: VsCodeThemeImportResult | null;
  error: string | null;
}

export interface ImportActions {
  setActiveTab: (t: ImportTab) => void;
  setPasteValue: (v: string) => void;
  handleImport: () => void;
  handleReset: () => void;
}

export function writeCustomTokens(
  set: ConfigSet,
  cfg: AppConfig | null,
  tokens: Record<string, string>,
): void {
  void set('theming', { ...(cfg?.theming ?? {}), customTokens: tokens });
}

export function getCustomTokens(cfg: AppConfig | null): Record<string, string> {
  return cfg?.theming?.customTokens ?? {};
}

interface RunImportOpts {
  pasteValue: string;
  setError: (e: string | null) => void;
  setImportResult: (r: VsCodeThemeImportResult | null) => void;
  setPhase: (p: ModalPhase) => void;
  set: ConfigSet;
  config: AppConfig | null;
}

export function runImport({ pasteValue, setError, setImportResult, setPhase, set, config }: RunImportOpts): void {
  const input = pasteValue.trim();
  if (!input) {
    setError('Please paste a VS Code theme JSON or upload a .json file.');
    return;
  }
  const result = parseVsCodeTheme(input);
  if ('error' in result) {
    setError(result.error);
    return;
  }
  setError(null);
  setImportResult(result);
  setPhase('success');
  writeCustomTokens(set, config, result.tokens);
}

interface RunResetOpts {
  setPasteValue: (v: string) => void;
  setPhase: (p: ModalPhase) => void;
  setImportResult: (r: VsCodeThemeImportResult | null) => void;
  setError: (e: string | null) => void;
  set: ConfigSet;
  config: AppConfig | null;
  previousTokens: Record<string, string>;
}

export function runReset({ setPasteValue, setPhase, setImportResult, setError, set, config, previousTokens }: RunResetOpts): void {
  writeCustomTokens(set, config, previousTokens);
  setPhase('input');
  setImportResult(null);
  setPasteValue('');
  setError(null);
}

export function useImportState(
  set: ConfigSet,
  config: AppConfig | null,
  previousTokensRef: React.MutableRefObject<Record<string, string>>,
): ImportState & ImportActions {
  const [activeTab, setActiveTab] = useState<ImportTab>('paste');
  const [pasteValue, setPasteValue] = useState('');
  const [phase, setPhase] = useState<ModalPhase>('input');
  const [importResult, setImportResult] = useState<VsCodeThemeImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = useCallback(() => {
    runImport({ pasteValue, setError, setImportResult, setPhase, set, config });
  }, [pasteValue, set, config]);

  const handleReset = useCallback(() => {
    runReset({ setPasteValue, setPhase, setImportResult, setError, set, config, previousTokens: previousTokensRef.current });
  }, [set, config, previousTokensRef]);

  return { activeTab, pasteValue, phase, importResult, error, setActiveTab, setPasteValue, handleImport, handleReset };
}
