/**
 * KeybindingRow.tsx — A single keybinding action row.
 */

import React from 'react';

import type { KeybindingAction } from './keybindingsData';
import { KEYBINDING_ACTIONS } from './keybindingsData';

interface KeybindingRowProps {
  action: KeybindingAction;
  effectiveShortcut: string;
  isCustomised: boolean;
  isCapturing: boolean;
  capturedKeys: string;
  conflictId: string | null;
  isLast: boolean;
  onStartCapture: () => void;
  onCommit: () => void;
  onCancel: () => void;
  onReset: () => void;
}

export function KeybindingRow({
  action, effectiveShortcut, isCustomised,
  isCapturing, capturedKeys, conflictId, isLast,
  onStartCapture, onCommit, onCancel, onReset,
}: KeybindingRowProps): React.ReactElement {
  return (
    <div style={rowStyle(isCapturing, isLast)}>
      <ActionLabel label={action.label} isCustomised={isCustomised} />
      <ShortcutDisplay isCapturing={isCapturing} capturedKeys={capturedKeys} conflictId={conflictId} effectiveShortcut={effectiveShortcut} isCustomised={isCustomised} />
      <ActionButtons isCapturing={isCapturing} capturedKeys={capturedKeys} conflictId={conflictId} isCustomised={isCustomised} onStartCapture={onStartCapture} onCommit={onCommit} onCancel={onCancel} onReset={onReset} />
    </div>
  );
}

function ActionLabel({ label, isCustomised }: { label: string; isCustomised: boolean }): React.ReactElement {
  return (
    <div className="text-text-semantic-primary" style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
      {label}
      {isCustomised && <span className="text-interactive-accent" style={customBadgeStyle}>custom</span>}
    </div>
  );
}

function ShortcutDisplay({ isCapturing, capturedKeys, conflictId, effectiveShortcut, isCustomised }: {
  isCapturing: boolean; capturedKeys: string; conflictId: string | null; effectiveShortcut: string; isCustomised: boolean;
}): React.ReactElement {
  if (isCapturing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={captureBoxStyle(conflictId)}>{capturedKeys || 'Press a key...'}</div>
        {conflictId && (
          <span role="alert" className="text-status-error" style={conflictStyle}>
            Used by <em>{KEYBINDING_ACTIONS.find((a) => a.id === conflictId)?.label ?? conflictId}</em>
          </span>
        )}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <kbd style={kbdStyle(isCustomised)}>{effectiveShortcut || '\u2014'}</kbd>
    </div>
  );
}

function ActionButtons({ isCapturing, capturedKeys, conflictId, isCustomised, onStartCapture, onCommit, onCancel, onReset }: {
  isCapturing: boolean; capturedKeys: string; conflictId: string | null; isCustomised: boolean;
  onStartCapture: () => void; onCommit: () => void; onCancel: () => void; onReset: () => void;
}): React.ReactElement {
  if (isCapturing) {
    const canSave = !!capturedKeys && !conflictId;
    return (
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <button onClick={onCommit} disabled={!canSave} style={saveBtnStyle(canSave)}>Save</button>
        <button onClick={onCancel} className="text-text-semantic-primary" style={smallBtnStyle}>Cancel</button>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      <button onClick={onStartCapture} className="text-text-semantic-primary" style={smallBtnStyle}>Edit</button>
      {isCustomised && <button onClick={onReset} title="Reset to default" className="text-text-semantic-muted" style={resetBtnStyle}>↺</button>}
    </div>
  );
}

function rowStyle(isCapturing: boolean, isLast: boolean): React.CSSProperties {
  return {
    display: 'grid', gridTemplateColumns: '1fr auto auto',
    alignItems: 'center', gap: '10px', padding: '9px 12px',
    borderBottom: isLast ? 'none' : '1px solid var(--border)',
    background: isCapturing ? 'color-mix(in srgb, var(--accent) 8%, var(--bg-secondary))' : 'var(--bg-tertiary)',
    transition: 'background 120ms ease',
  };
}

const customBadgeStyle: React.CSSProperties = { fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' };

function captureBoxStyle(conflictId: string | null): React.CSSProperties {
  return {
    minWidth: '140px', padding: '4px 10px', borderRadius: '5px',
    border: `1px solid ${conflictId ? 'var(--error)' : 'var(--accent)'}`,
    background: 'var(--bg)', fontSize: '12px', fontFamily: 'var(--font-mono)',
    color: conflictId ? 'var(--error)' : 'var(--accent)', textAlign: 'center',
  };
}

const conflictStyle: React.CSSProperties = { fontSize: '11px', maxWidth: '120px', lineHeight: 1.3 };

function kbdStyle(isCustomised: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', padding: '3px 7px',
    borderRadius: '4px', border: `1px solid ${isCustomised ? 'var(--accent-muted)' : 'var(--border)'}`,
    background: 'var(--bg-secondary)', fontSize: '11px', fontFamily: 'var(--font-mono)',
    color: isCustomised ? 'var(--accent)' : 'var(--text-secondary)',
    whiteSpace: 'nowrap', minWidth: '80px', textAlign: 'center',
  };
}

const smallBtnStyle: React.CSSProperties = { padding: '4px 10px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' };

function saveBtnStyle(canSave: boolean): React.CSSProperties {
  return {
    ...smallBtnStyle,
    background: canSave ? 'var(--accent)' : 'transparent',
    color: canSave ? 'var(--text-on-accent)' : 'var(--text-muted)',
    borderColor: canSave ? 'var(--accent)' : 'var(--border)',
    cursor: canSave ? 'pointer' : 'not-allowed',
  };
}

const resetBtnStyle: React.CSSProperties = { ...smallBtnStyle, borderColor: 'transparent', background: 'transparent' };
