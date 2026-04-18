/**
 * ThemeImportModal.tsx — VS Code theme import modal.
 *
 * Wave 35 Phase C. Paste or upload a VS Code theme JSON, preview live via
 * useTokenOverrides, then Keep or Cancel/Reset the result.
 *
 * Live preview: writes config.theming.customTokens → useTokenOverrides picks
 * up the new slice on next render and patches document.documentElement CSS vars.
 * Cancel reverts to the customTokens value that existed when the modal opened.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useConfig } from '../../hooks/useConfig';
import { parseVsCodeTheme, type VsCodeThemeImportResult } from '../../themes/vsCodeImport';
import type { AppConfig } from '../../types/electron';
import { type ImportTab, ThemeImportModalBody } from './ThemeImportModalBody';
import { ThemeImportSummary } from './ThemeImportSummary';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ThemeImportModalProps { onClose: () => void }
type ModalPhase = 'input' | 'success';
type ConfigSet = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => Promise<void>;

// ── Config helpers ────────────────────────────────────────────────────────────

function getCustomTokens(cfg: AppConfig | null): Record<string, string> {
  return cfg?.theming?.customTokens ?? {};
}

function writeCustomTokens(set: ConfigSet, cfg: AppConfig | null, tokens: Record<string, string>): void {
  void set('theming', { ...(cfg?.theming ?? {}), customTokens: tokens });
}

// ── Styles ────────────────────────────────────────────────────────────────────

const scrimStyle: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.55)', // hardcoded: scrim overlay — opacity composite, not a semantic color
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
};

const cardStyle: React.CSSProperties = {
  background: 'var(--surface-overlay)', border: '1px solid var(--border-semantic)',
  borderRadius: '10px', width: '520px', maxWidth: '90vw', maxHeight: '80vh',
  overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column',
  gap: '16px',
  boxShadow: '0 8px 40px rgba(0,0,0,0.4)', // hardcoded: drop shadow — opacity overlay, not a semantic color
};

const footerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' };

function btnStyle(primary: boolean): React.CSSProperties {
  return {
    padding: '7px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
    fontWeight: primary ? 600 : 400,
    border: primary ? 'none' : '1px solid var(--border-semantic)',
    background: primary ? 'var(--interactive-accent)' : 'transparent',
    color: primary ? 'var(--text-on-accent)' : 'var(--text-text-semantic-primary)',
  };
}

// ── ModalFooter ───────────────────────────────────────────────────────────────

interface FooterProps {
  phase: ModalPhase; importDisabled: boolean;
  onImport: () => void; onKeep: () => void; onReset: () => void; onCancel: () => void;
}

function ModalFooter({ phase, importDisabled, onImport, onKeep, onReset, onCancel }: FooterProps): React.ReactElement {
  if (phase === 'success') {
    return (
      <div style={footerStyle}>
        <button onClick={onReset} style={btnStyle(false)} type="button">Reset</button>
        <button onClick={onCancel} style={btnStyle(false)} type="button">Cancel</button>
        <button onClick={onKeep} style={btnStyle(true)} type="button">Keep</button>
      </div>
    );
  }
  return (
    <div style={footerStyle}>
      <button onClick={onCancel} style={btnStyle(false)} type="button">Cancel</button>
      <button disabled={importDisabled} onClick={onImport} style={{ ...btnStyle(true), opacity: importDisabled ? 0.5 : 1 }} type="button">
        Import
      </button>
    </div>
  );
}

// ── useImportState ────────────────────────────────────────────────────────────

interface ImportState {
  activeTab: ImportTab; pasteValue: string;
  phase: ModalPhase; importResult: VsCodeThemeImportResult | null; error: string | null;
}

interface ImportActions {
  setActiveTab: (t: ImportTab) => void; setPasteValue: (v: string) => void;
  handleImport: () => void; handleReset: () => void;
}

function useImportState(
  set: ConfigSet, config: AppConfig | null, previousTokensRef: React.MutableRefObject<Record<string, string>>,
): ImportState & ImportActions {
  const [activeTab, setActiveTab] = useState<ImportTab>('paste');
  const [pasteValue, setPasteValue] = useState('');
  const [phase, setPhase] = useState<ModalPhase>('input');
  const [importResult, setImportResult] = useState<VsCodeThemeImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleImport(): void {
    const input = pasteValue.trim();
    if (!input) { setError('Please paste a VS Code theme JSON or upload a .json file.'); return; }
    const result = parseVsCodeTheme(input);
    if ('error' in result) { setError(result.error); return; }
    setError(null); setImportResult(result); setPhase('success');
    writeCustomTokens(set, config, result.tokens);
  }

  function handleReset(): void {
    writeCustomTokens(set, config, previousTokensRef.current);
    setPhase('input'); setImportResult(null); setPasteValue(''); setError(null);
  }

  return { activeTab, pasteValue, phase, importResult, error, setActiveTab, setPasteValue, handleImport, handleReset };
}

// ── ModalCard ─────────────────────────────────────────────────────────────────

interface CardProps extends ImportState, ImportActions {
  onClose: () => void; revert: () => void; cardRef: React.RefObject<HTMLDivElement | null>;
}

function ModalCard({ activeTab, pasteValue, phase, importResult, error, setActiveTab, setPasteValue, handleImport, handleReset, onClose, revert, cardRef }: CardProps): React.ReactElement {
  function handleFileLoad(content: string): void { setPasteValue(content); setActiveTab('paste'); }
  return (
    <div ref={cardRef} style={cardStyle}>
      <div>
        <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-text-semantic-primary)', margin: 0 }}>Import VS Code Theme</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-text-semantic-muted)', margin: 0 }}>
          Paste a VS Code theme JSON or upload a .json file to preview and apply it.
        </p>
      </div>
      {phase === 'input' && (
        <ThemeImportModalBody activeTab={activeTab} error={error} onFileLoad={handleFileLoad} onPasteChange={setPasteValue} onTabChange={setActiveTab} pasteValue={pasteValue} />
      )}
      {phase === 'success' && importResult !== null && <ThemeImportSummary result={importResult} />}
      <ModalFooter importDisabled={pasteValue.trim() === ''} onCancel={revert} onImport={handleImport} onKeep={onClose} onReset={handleReset} phase={phase} />
    </div>
  );
}

// ── ThemeImportModal ──────────────────────────────────────────────────────────

export function ThemeImportModal({ onClose }: ThemeImportModalProps): React.ReactElement {
  const { config, set } = useConfig();
  const previousTokensRef = useRef<Record<string, string>>(getCustomTokens(config));
  const cardRef = useRef<HTMLDivElement>(null);
  const state = useImportState(set, config, previousTokensRef);

  useEffect(() => {
    const first = cardRef.current?.querySelector<HTMLElement>(
      'button, textarea, input, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
  }, []);

  const revert = useCallback(() => {
    writeCustomTokens(set, config, previousTokensRef.current);
    onClose();
  }, [set, config, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => { if (e.key === 'Escape') revert(); }, [revert]);

  function handleScrimClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (e.target === e.currentTarget) revert();
  }

  return (
    <div aria-modal="true" onClick={handleScrimClick} onKeyDown={handleKeyDown} role="dialog" style={scrimStyle}>
      <ModalCard {...state} cardRef={cardRef} onClose={onClose} revert={revert} />
    </div>
  );
}
