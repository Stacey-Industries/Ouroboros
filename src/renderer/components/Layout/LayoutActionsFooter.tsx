/**
 * LayoutActionsFooter.tsx — Wave 28 Phase D
 *
 * Footer buttons for the LayoutSwitcher: Undo last mutation, Reset to preset,
 * Promote current layout to a named global preset. All three actions operate
 * on the in-memory slot tree via useLayoutPreset().
 */

import React, { useCallback, useState } from 'react';

import { useLayoutPreset } from './layoutPresets/LayoutPresetResolver';

export function LayoutActionsFooter(): React.ReactElement {
  const { canUndo, undoLayout, resetLayout, promoteToGlobal } = useLayoutPreset();
  const [showPromote, setShowPromote] = useState(false);
  const [name, setName] = useState('');

  const handlePromote = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    promoteToGlobal(trimmed);
    setName('');
    setShowPromote(false);
  }, [name, promoteToGlobal]);

  return (
    <div className="border-t border-border-semantic" style={rowStyle}>
      <div style={{ display: 'flex', gap: '6px' }}>
        <ActionButton onClick={undoLayout} disabled={!canUndo} title="Undo last layout change">Undo</ActionButton>
        <ActionButton onClick={resetLayout} title="Reset to preset default">Reset</ActionButton>
        <ActionButton onClick={() => setShowPromote((p) => !p)} title="Save current layout as a named preset">
          Save as…
        </ActionButton>
      </div>
      {showPromote && (
        <PromoteInput
          name={name}
          onChange={setName}
          onConfirm={handlePromote}
          onCancel={() => { setShowPromote(false); setName(''); }}
        />
      )}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0,
};

function ActionButton({ onClick, disabled, title, children }: {
  onClick: () => void; disabled?: boolean; title: string; children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="text-text-semantic-muted border border-border-semantic"
      style={{
        background: 'none', borderRadius: '4px', fontSize: '11px', padding: '2px 8px',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function PromoteInput({ name, onChange, onConfirm, onCancel }: {
  name: string; onChange: (v: string) => void; onConfirm: () => void; onCancel: () => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      <input
        type="text"
        value={name}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onConfirm();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Preset name"
        autoFocus
        className="bg-surface-inset border border-border-semantic text-text-semantic-primary"
        style={{ flex: 1, padding: '2px 6px', fontSize: '11px', borderRadius: '4px' }}
      />
      <button
        type="button"
        onClick={onConfirm}
        disabled={!name.trim()}
        className="bg-interactive-accent text-text-semantic-on-accent"
        style={{ padding: '2px 8px', fontSize: '11px', borderRadius: '4px', cursor: name.trim() ? 'pointer' : 'default', opacity: name.trim() ? 1 : 0.5 }}
      >
        Save
      </button>
    </div>
  );
}
