import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { AppConfig } from '../../types/electron';

// ─── Action definitions ───────────────────────────────────────────────────────

export interface KeybindingAction {
  /** Unique action identifier — matches the key used in config.keybindings */
  id: string;
  label: string;
  category: string;
  /** Default shortcut (what ships out of the box) */
  defaultShortcut: string;
}

export const KEYBINDING_ACTIONS: KeybindingAction[] = [
  // App
  { id: 'app:settings',           label: 'Open Settings',        category: 'App',      defaultShortcut: 'Ctrl+,' },
  { id: 'app:command-palette',    label: 'Command Palette',       category: 'App',      defaultShortcut: 'Ctrl+Shift+P' },

  // File
  { id: 'file:open-file',         label: 'Go to File (Picker)',   category: 'File',     defaultShortcut: 'Ctrl+P' },

  // View
  { id: 'view:toggle-sidebar',    label: 'Toggle Left Sidebar',   category: 'View',     defaultShortcut: 'Ctrl+B' },
  { id: 'view:toggle-terminal',   label: 'Toggle Terminal',       category: 'View',     defaultShortcut: 'Ctrl+J' },
  { id: 'view:toggle-agent-monitor', label: 'Toggle Agent Monitor', category: 'View',   defaultShortcut: 'Ctrl+\\' },

  // Terminal
  { id: 'terminal:new-tab',       label: 'New Terminal Tab',      category: 'Terminal', defaultShortcut: 'Ctrl+Shift+`' },

  // Editor
  { id: 'editor:find',            label: 'Find in File',          category: 'Editor',   defaultShortcut: 'Ctrl+F' },
  { id: 'editor:go-to-line',      label: 'Go to Line',            category: 'Editor',   defaultShortcut: 'Ctrl+G' },
  { id: 'editor:toggle-diff',     label: 'Toggle Diff View',      category: 'Editor',   defaultShortcut: 'Ctrl+D' },
  { id: 'editor:fold-all',        label: 'Fold All',              category: 'Editor',   defaultShortcut: 'Ctrl+Shift+[' },
  { id: 'editor:unfold-all',      label: 'Unfold All',            category: 'Editor',   defaultShortcut: 'Ctrl+Shift+]' },
  { id: 'editor:word-wrap',       label: 'Toggle Word Wrap',      category: 'Editor',   defaultShortcut: 'Alt+Z' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalise a KeyboardEvent into a display string like "Ctrl+Shift+K".
 * Returns null if the key is a modifier-only press.
 */
export function keyEventToString(e: KeyboardEvent): string | null {
  const modifierKeys = new Set(['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'Dead']);
  if (modifierKeys.has(e.key)) return null;

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  // Normalise special keys
  let key = e.key;
  if (key === ' ') key = 'Space';
  else if (key === 'ArrowUp') key = 'Up';
  else if (key === 'ArrowDown') key = 'Down';
  else if (key === 'ArrowLeft') key = 'Left';
  else if (key === 'ArrowRight') key = 'Right';
  else if (key.length === 1) key = key.toUpperCase();

  parts.push(key);
  return parts.join('+');
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface KeybindingsSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function KeybindingsSection({ draft, onChange }: KeybindingsSectionProps): React.ReactElement {
  const keybindings = draft.keybindings ?? {};

  /** The action currently being re-bound (null = none) */
  const [capturingId, setCapturingId] = useState<string | null>(null);
  /** Keys captured so far (shown live) */
  const [capturedKeys, setCapturedKeys] = useState<string>('');
  /** Conflict: which existing action uses the same shortcut */
  const [conflictId, setConflictId] = useState<string | null>(null);

  const capturingIdRef = useRef<string | null>(null);
  capturingIdRef.current = capturingId;

  // Group actions by category
  const categories = Array.from(new Set(KEYBINDING_ACTIONS.map((a) => a.category)));

  function getEffectiveShortcut(actionId: string): string {
    return keybindings[actionId] ?? KEYBINDING_ACTIONS.find((a) => a.id === actionId)?.defaultShortcut ?? '';
  }

  function findConflict(shortcut: string, excludeId: string): string | null {
    for (const action of KEYBINDING_ACTIONS) {
      if (action.id === excludeId) continue;
      const effective = getEffectiveShortcut(action.id);
      if (effective.toLowerCase() === shortcut.toLowerCase()) {
        return action.id;
      }
    }
    return null;
  }

  function startCapture(actionId: string): void {
    setCapturingId(actionId);
    setCapturedKeys('');
    setConflictId(null);
  }

  function cancelCapture(): void {
    setCapturingId(null);
    setCapturedKeys('');
    setConflictId(null);
  }

  function commitShortcut(actionId: string, shortcut: string): void {
    const updated = { ...keybindings, [actionId]: shortcut };
    onChange('keybindings', updated);
    setCapturingId(null);
    setCapturedKeys('');
    setConflictId(null);
  }

  function resetToDefault(actionId: string): void {
    const updated = { ...keybindings };
    delete updated[actionId];
    onChange('keybindings', updated);
  }

  // Keyboard capture handler
  const handleCaptureKeyDown = useCallback(
    (e: KeyboardEvent): void => {
      if (!capturingIdRef.current) return;

      // Escape cancels
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelCapture();
        return;
      }

      // Enter commits if we have a shortcut
      if (e.key === 'Enter' && capturedKeys) {
        e.preventDefault();
        e.stopPropagation();
        if (capturingIdRef.current && !conflictId) {
          commitShortcut(capturingIdRef.current, capturedKeys);
        }
        return;
      }

      const shortcut = keyEventToString(e);
      if (!shortcut) return;

      e.preventDefault();
      e.stopPropagation();

      setCapturedKeys(shortcut);
      const conflict = findConflict(shortcut, capturingIdRef.current);
      setConflictId(conflict);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capturedKeys, conflictId, keybindings],
  );

  useEffect(() => {
    if (!capturingId) return;

    window.addEventListener('keydown', handleCaptureKeyDown, true);
    return () => window.removeEventListener('keydown', handleCaptureKeyDown, true);
  }, [capturingId, handleCaptureKeyDown]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
        Click <strong style={{ color: 'var(--text)' }}>Edit</strong> on an action, then press the desired key combination.
        Press <kbd style={kbdStyle}>Escape</kbd> to cancel or <kbd style={kbdStyle}>Enter</kbd> to confirm.
      </p>

      {categories.map((category) => {
        const actions = KEYBINDING_ACTIONS.filter((a) => a.category === category);
        return (
          <section key={category}>
            <div style={categoryLabelStyle}>{category}</div>

            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              {actions.map((action, idx) => {
                const isCapturing = capturingId === action.id;
                const effective = getEffectiveShortcut(action.id);
                const isCustomised = action.id in keybindings;
                const isLast = idx === actions.length - 1;

                return (
                  <div
                    key={action.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '9px 12px',
                      borderBottom: isLast ? 'none' : '1px solid var(--border)',
                      background: isCapturing
                        ? 'color-mix(in srgb, var(--accent) 8%, var(--bg-secondary))'
                        : 'var(--bg-tertiary)',
                      transition: 'background 120ms ease',
                    }}
                  >
                    {/* Action name */}
                    <div
                      style={{
                        fontSize: '13px',
                        color: 'var(--text)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      {action.label}
                      {isCustomised && (
                        <span
                          style={{
                            fontSize: '10px',
                            color: 'var(--accent)',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          custom
                        </span>
                      )}
                    </div>

                    {/* Shortcut display / capture area */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isCapturing ? (
                        <>
                          <div
                            style={{
                              minWidth: '140px',
                              padding: '4px 10px',
                              borderRadius: '5px',
                              border: `1px solid ${conflictId ? 'var(--error)' : 'var(--accent)'}`,
                              background: 'var(--bg)',
                              fontSize: '12px',
                              fontFamily: 'var(--font-mono)',
                              color: capturedKeys
                                ? conflictId
                                  ? 'var(--error)'
                                  : 'var(--accent)'
                                : 'var(--text-muted)',
                              textAlign: 'center',
                            }}
                          >
                            {capturedKeys || 'Press a key…'}
                          </div>
                          {conflictId && (
                            <span
                              role="alert"
                              style={{
                                fontSize: '11px',
                                color: 'var(--error)',
                                maxWidth: '120px',
                                lineHeight: 1.3,
                              }}
                            >
                              Used by{' '}
                              <em>
                                {KEYBINDING_ACTIONS.find((a) => a.id === conflictId)?.label ?? conflictId}
                              </em>
                            </span>
                          )}
                        </>
                      ) : (
                        <kbd
                          style={{
                            ...kbdStyle,
                            minWidth: '80px',
                            textAlign: 'center',
                            color: isCustomised ? 'var(--accent)' : 'var(--text-secondary)',
                            borderColor: isCustomised ? 'var(--accent-muted)' : 'var(--border)',
                          }}
                        >
                          {effective || '—'}
                        </kbd>
                      )}
                    </div>

                    {/* Actions column */}
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      {isCapturing ? (
                        <>
                          <button
                            onClick={() => {
                              if (capturedKeys && !conflictId && capturingId) {
                                commitShortcut(capturingId, capturedKeys);
                              }
                            }}
                            disabled={!capturedKeys || !!conflictId}
                            style={{
                              ...smallButtonStyle,
                              background: !capturedKeys || conflictId ? 'transparent' : 'var(--accent)',
                              color: !capturedKeys || conflictId ? 'var(--text-muted)' : 'var(--bg)',
                              borderColor: !capturedKeys || conflictId ? 'var(--border)' : 'var(--accent)',
                              cursor: !capturedKeys || conflictId ? 'not-allowed' : 'pointer',
                            }}
                          >
                            Save
                          </button>
                          <button onClick={cancelCapture} style={smallButtonStyle}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startCapture(action.id)}
                            style={smallButtonStyle}
                          >
                            Edit
                          </button>
                          {isCustomised && (
                            <button
                              onClick={() => resetToDefault(action.id)}
                              title="Reset to default"
                              aria-label={`Reset ${action.label} to default`}
                              style={{
                                ...smallButtonStyle,
                                color: 'var(--text-muted)',
                                borderColor: 'transparent',
                                background: 'transparent',
                              }}
                            >
                              ↺
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
        Keybinding changes take effect immediately after saving. Some shortcuts may not apply
        until the relevant panel or file is active.
      </p>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const categoryLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  marginBottom: '8px',
};

const kbdStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 7px',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
};

const smallButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: '5px',
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  color: 'var(--text)',
  fontSize: '12px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
