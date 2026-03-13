/**
 * LayoutSwitcher.tsx — Dropdown popover for switching workspace layouts.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { WorkspaceLayout } from '../../types/electron';
import { LayoutSaveInput } from './LayoutSaveInput';
import { LayoutListItem } from './LayoutListItem';

export interface LayoutSwitcherProps {
  layouts: WorkspaceLayout[];
  activeLayoutName: string;
  currentPanelSizes: import('../../types/electron').PanelSizes;
  currentVisiblePanels: { leftSidebar: boolean; rightSidebar: boolean; terminal: boolean };
  onSelect: (layout: WorkspaceLayout) => void;
  onSave: (name: string) => void;
  onUpdate: (name: string) => void;
  onDelete: (name: string) => void;
  onClose: () => void;
}

export function LayoutSwitcher({ layouts, activeLayoutName, onSelect, onSave, onUpdate, onDelete, onClose }: LayoutSwitcherProps): React.ReactElement {
  const [showSaveInput, setShowSaveInput] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onMouse = (e: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouse);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onMouse); };
  }, [onClose]);

  const handleSaved = useCallback((name: string) => {
    onSave(name);
    setShowSaveInput(false);
  }, [onSave]);

  return (
    <div ref={dropdownRef} role="listbox" aria-label="Workspace layouts" style={dropdownStyle}>
      <LayoutHeader onToggleSave={() => setShowSaveInput((p) => !p)} />
      {showSaveInput && <LayoutSaveInput layouts={layouts} onSave={handleSaved} onCancel={() => setShowSaveInput(false)} />}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {layouts.map((layout) => (
          <LayoutListItem key={layout.name} layout={layout} isActive={layout.name === activeLayoutName} onSelect={onSelect} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
      </div>
      <div style={{ padding: '5px 10px', borderTop: '1px solid var(--border-muted)', fontSize: '10px', color: 'var(--text-faint)', flexShrink: 0 }}>
        Ctrl+Alt+1/2/3 to quick-switch
      </div>
    </div>
  );
}

const dropdownStyle: React.CSSProperties = {
  position: 'fixed', bottom: '26px', right: '8px', zIndex: 1000,
  minWidth: '240px', maxWidth: '320px', maxHeight: '340px',
  backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)',
  borderRadius: '6px', boxShadow: '0 -4px 16px rgba(0,0,0,0.4)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
  fontFamily: 'var(--font-ui)', fontSize: '0.8125rem',
};

function LayoutHeader({ onToggleSave }: { onToggleSave: () => void }): React.ReactElement {
  return (
    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '12px' }}>Workspace Layouts</span>
      <button
        onClick={onToggleSave}
        title="Save current layout"
        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-muted)', fontSize: '11px', padding: '2px 8px', cursor: 'pointer', transition: 'color 120ms, border-color 120ms' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
      >
        + Save Current
      </button>
    </div>
  );
}
