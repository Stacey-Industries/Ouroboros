/**
 * ThemeImportModalBody.tsx — Paste/upload tab UI for ThemeImportModal.
 *
 * Wave 35 Phase C.
 */

import React, { useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ImportTab = 'paste' | 'upload';

interface ThemeImportModalBodyProps {
  activeTab: ImportTab;
  pasteValue: string;
  error: string | null;
  onTabChange: (tab: ImportTab) => void;
  onPasteChange: (value: string) => void;
  onFileLoad: (content: string) => void;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '2px',
  borderBottom: '1px solid var(--border-subtle)',
  marginBottom: '12px',
};

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: '6px 14px',
    fontSize: '12px',
    border: 'none',
    borderBottom: active ? '2px solid var(--interactive-accent)' : '2px solid transparent',
    background: 'none',
    cursor: 'pointer',
    color: active ? 'var(--text-text-semantic-primary)' : 'var(--text-text-semantic-muted)',
    fontWeight: active ? 600 : 400,
    marginBottom: '-1px',
  };
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '180px',
  padding: '10px',
  borderRadius: '6px',
  border: '1px solid var(--border-semantic)',
  background: 'var(--surface-inset)',
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
};

const uploadAreaStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  minHeight: '140px',
  border: '2px dashed var(--border-subtle)',
  borderRadius: '8px',
  background: 'var(--surface-inset)',
  cursor: 'pointer',
  padding: '24px',
};

const uploadLabelStyle: React.CSSProperties = {
  fontSize: '13px',
  color: 'var(--text-text-semantic-muted)',
  textAlign: 'center',
};

const errorStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--status-error)',
  padding: '8px 10px',
  borderRadius: '4px',
  background: 'var(--bg-status-error-subtle)',
  border: '1px solid var(--status-error)',
  wordBreak: 'break-word',
};

// ── TabBar ────────────────────────────────────────────────────────────────────

interface TabBarProps {
  activeTab: ImportTab;
  onTabChange: (tab: ImportTab) => void;
}

function TabBar({ activeTab, onTabChange }: TabBarProps): React.ReactElement {
  return (
    <div style={tabBarStyle}>
      <button
        onClick={() => onTabChange('paste')}
        style={tabButtonStyle(activeTab === 'paste')}
        type="button"
      >
        Paste JSON
      </button>
      <button
        onClick={() => onTabChange('upload')}
        style={tabButtonStyle(activeTab === 'upload')}
        type="button"
      >
        Upload file
      </button>
    </div>
  );
}

// ── UploadTab ─────────────────────────────────────────────────────────────────

function UploadTab({ onFileLoad }: { onFileLoad: (content: string) => void }): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === 'string') onFileLoad(text);
    };
    reader.readAsText(file);
  }

  return (
    <div style={uploadAreaStyle} onClick={() => inputRef.current?.click()}>
      <input
        ref={inputRef}
        accept=".json"
        aria-label="Upload VS Code theme JSON file"
        onChange={handleChange}
        style={{ display: 'none' }}
        type="file"
      />
      <span aria-hidden="true" style={{ fontSize: '32px' }}>📂</span>
      <span style={uploadLabelStyle}>
        Click to select a <strong>.json</strong> VS Code theme file
      </span>
    </div>
  );
}

// ── ThemeImportModalBody ──────────────────────────────────────────────────────

export function ThemeImportModalBody({
  activeTab,
  pasteValue,
  error,
  onTabChange,
  onPasteChange,
  onFileLoad,
}: ThemeImportModalBodyProps): React.ReactElement {
  const PLACEHOLDER = '{\n  "colors": {\n    "editor.background": "#1e1e1e"\n  }\n}'; // hardcoded: sample JSON in placeholder, not a rendered color
  return (
    <div>
      <TabBar activeTab={activeTab} onTabChange={onTabChange} />
      {activeTab === 'paste' ? (
        <textarea
          aria-label="VS Code theme JSON"
          onChange={(e) => onPasteChange(e.target.value)}
          placeholder={PLACEHOLDER}
          style={textareaStyle}
          value={pasteValue}
        />
      ) : (
        <UploadTab onFileLoad={onFileLoad} />
      )}
      {error !== null && (
        <div role="alert" style={{ marginTop: '10px' }}>
          <div style={errorStyle}>{error}</div>
        </div>
      )}
    </div>
  );
}
