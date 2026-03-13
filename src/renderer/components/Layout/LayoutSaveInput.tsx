/**
 * LayoutSaveInput.tsx — Inline form for naming and saving a new layout.
 * Extracted from LayoutSwitcher.tsx.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { WorkspaceLayout } from '../../types/electron';

export interface LayoutSaveInputProps {
  layouts: WorkspaceLayout[];
  onSave: (name: string) => void;
  onCancel: () => void;
}

export function LayoutSaveInput({ layouts, onSave, onCancel }: LayoutSaveInputProps): React.ReactElement {
  const [saveName, setSaveName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = saveName.trim();
    if (!trimmed) return;
    const exists = layouts.some((l) => l.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) return;
    onSave(trimmed);
  }, [saveName, layouts, onSave]);

  return (
    <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-muted)', display: 'flex', gap: '6px', flexShrink: 0 }}>
      <input
        ref={inputRef} type="text" placeholder="Layout name…" value={saveName}
        onChange={(e) => setSaveName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel(); }}
        style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', fontSize: '0.75rem', fontFamily: 'var(--font-ui)', padding: '3px 6px', outline: 'none', boxSizing: 'border-box' }}
      />
      <button
        onClick={handleSubmit} disabled={!saveName.trim()}
        style={{ background: saveName.trim() ? 'var(--accent)' : 'var(--bg-tertiary)', border: 'none', borderRadius: '4px', color: saveName.trim() ? 'var(--bg)' : 'var(--text-muted)', fontSize: '11px', fontWeight: 600, padding: '3px 10px', cursor: saveName.trim() ? 'pointer' : 'not-allowed' }}
      >
        Save
      </button>
    </div>
  );
}
