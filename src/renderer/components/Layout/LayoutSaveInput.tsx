/**
 * LayoutSaveInput.tsx — Inline form for naming and saving a new layout.
 * Extracted from LayoutSwitcher.tsx.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { WorkspaceLayout } from '../../types/electron';

export interface LayoutSaveInputProps {
  layouts: WorkspaceLayout[];
  onSave: (name: string) => void;
  onCancel: () => void;
}

const INPUT_STYLE: React.CSSProperties = { flex: 1, borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'var(--font-ui)', padding: '3px 6px', outline: 'none', boxSizing: 'border-box' };

export function LayoutSaveInput({ layouts, onSave, onCancel }: LayoutSaveInputProps): React.ReactElement {
  const [saveName, setSaveName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const handleSubmit = useCallback(() => {
    const trimmed = saveName.trim();
    if (!trimmed) return;
    if (layouts.some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) return;
    onSave(trimmed);
  }, [saveName, layouts, onSave]);
  const hasTrim = Boolean(saveName.trim());
  return (
    <div className="border-b border-border-semantic" style={{ padding: '6px 8px', display: 'flex', gap: '6px', flexShrink: 0 }}>
      <input ref={inputRef} type="text" placeholder="Layout name…" value={saveName}
        onChange={(e) => setSaveName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel(); }}
        className="bg-surface-base border border-border-semantic text-text-semantic-primary"
        style={INPUT_STYLE}
      />
      <button onClick={handleSubmit} disabled={!hasTrim}
        style={{ background: hasTrim ? 'var(--interactive-accent)' : 'var(--surface-raised)', border: 'none', borderRadius: '4px', color: hasTrim ? 'var(--surface-base)' : 'var(--text-secondary)', fontSize: '11px', fontWeight: 600, padding: '3px 10px', cursor: hasTrim ? 'pointer' : 'not-allowed' }}
      >
        Save
      </button>
    </div>
  );
}
