/**
 * LayoutSwitcher.tsx — Dropdown popover for switching workspace layouts.
 *
 * Triggered from the status bar. Shows saved layouts with radio-style selection,
 * plus Save Current / Update / Delete actions for custom layouts.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { WorkspaceLayout, PanelSizes } from '../../types/electron';

// ─── Props ──────────────────────────────────────────────────────────────────────

export interface LayoutSwitcherProps {
  /** All saved layouts */
  layouts: WorkspaceLayout[];
  /** Name of the currently active layout */
  activeLayoutName: string;
  /** Current panel sizes (for saving) */
  currentPanelSizes: PanelSizes;
  /** Current panel visibility (for saving) */
  currentVisiblePanels: {
    leftSidebar: boolean;
    rightSidebar: boolean;
    terminal: boolean;
  };
  /** Called when user selects a layout */
  onSelect: (layout: WorkspaceLayout) => void;
  /** Called when user saves the current arrangement as a new layout */
  onSave: (name: string) => void;
  /** Called when user updates an existing custom layout with current state */
  onUpdate: (name: string) => void;
  /** Called when user deletes a custom layout */
  onDelete: (name: string) => void;
  /** Close the popover */
  onClose: () => void;
}

// ─── LayoutSwitcher ─────────────────────────────────────────────────────────────

export function LayoutSwitcher({
  layouts,
  activeLayoutName,
  onSelect,
  onSave,
  onUpdate,
  onDelete,
  onClose,
}: LayoutSwitcherProps): React.ReactElement {
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Dismiss on click outside or Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [onClose]);

  // Focus input when save mode is shown
  useEffect(() => {
    if (showSaveInput) {
      inputRef.current?.focus();
    }
  }, [showSaveInput]);

  const handleSaveSubmit = useCallback(() => {
    const trimmed = saveName.trim();
    if (!trimmed) return;
    // Check if name already exists
    const exists = layouts.some((l) => l.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) return; // Don't allow duplicate names
    onSave(trimmed);
    setSaveName('');
    setShowSaveInput(false);
  }, [saveName, layouts, onSave]);

  return (
    <div
      ref={dropdownRef}
      role="listbox"
      aria-label="Workspace layouts"
      style={{
        position: 'fixed',
        bottom: '26px',
        right: '8px',
        zIndex: 1000,
        minWidth: '240px',
        maxWidth: '320px',
        maxHeight: '340px',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'var(--font-ui)',
        fontSize: '0.8125rem',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '12px' }}>
          Workspace Layouts
        </span>
        <button
          onClick={() => setShowSaveInput((prev) => !prev)}
          title="Save current layout"
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: 'var(--text-muted)',
            fontSize: '11px',
            padding: '2px 8px',
            cursor: 'pointer',
            transition: 'color 120ms, border-color 120ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text)';
            e.currentTarget.style.borderColor = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
        >
          + Save Current
        </button>
      </div>

      {/* Save input */}
      {showSaveInput && (
        <div
          style={{
            padding: '6px 8px',
            borderBottom: '1px solid var(--border-muted)',
            display: 'flex',
            gap: '6px',
            flexShrink: 0,
          }}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="Layout name…"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveSubmit();
              if (e.key === 'Escape') {
                setShowSaveInput(false);
                setSaveName('');
              }
            }}
            style={{
              flex: 1,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text)',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-ui)',
              padding: '3px 6px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={handleSaveSubmit}
            disabled={!saveName.trim()}
            style={{
              background: saveName.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
              border: 'none',
              borderRadius: '4px',
              color: saveName.trim() ? 'var(--bg)' : 'var(--text-muted)',
              fontSize: '11px',
              fontWeight: 600,
              padding: '3px 10px',
              cursor: saveName.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Save
          </button>
        </div>
      )}

      {/* Layout list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {layouts.map((layout) => {
          const isActive = layout.name === activeLayoutName;
          return (
            <div
              key={layout.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                cursor: 'pointer',
                transition: 'background 80ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {/* Radio indicator + label (clickable) */}
              <button
                role="option"
                aria-selected={isActive}
                onClick={() => onSelect(layout)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: isActive ? 'var(--accent)' : 'var(--text)',
                  fontFamily: 'var(--font-ui)',
                  fontSize: '0.8125rem',
                  padding: 0,
                }}
              >
                {/* Radio dot */}
                <span
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'border-color 120ms',
                  }}
                >
                  {isActive && (
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--accent)',
                      }}
                    />
                  )}
                </span>

                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {layout.name}
                </span>

                {layout.builtIn && (
                  <span
                    style={{
                      fontSize: '9px',
                      color: 'var(--text-faint)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      flexShrink: 0,
                    }}
                  >
                    built-in
                  </span>
                )}
              </button>

              {/* Action buttons for non-built-in layouts */}
              {!layout.builtIn && (
                <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                  <button
                    title="Update with current layout"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdate(layout.name);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-faint)',
                      fontSize: '11px',
                      padding: '2px 4px',
                      borderRadius: '3px',
                      transition: 'color 100ms, background 100ms',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--text)';
                      e.currentTarget.style.backgroundColor = 'rgba(128,128,128,0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-faint)';
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 1v6m0 0l2.5-2.5M8 7L5.5 4.5" />
                      <path d="M2 10v3a1 1 0 001 1h10a1 1 0 001-1v-3" />
                    </svg>
                  </button>
                  <button
                    title="Delete layout"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(layout.name);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-faint)',
                      fontSize: '11px',
                      padding: '2px 4px',
                      borderRadius: '3px',
                      transition: 'color 100ms, background 100ms',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--error, #f85149)';
                      e.currentTarget.style.backgroundColor = 'rgba(248,81,73,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-faint)';
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div
        style={{
          padding: '5px 10px',
          borderTop: '1px solid var(--border-muted)',
          fontSize: '10px',
          color: 'var(--text-faint)',
          flexShrink: 0,
        }}
      >
        Ctrl+Alt+1/2/3 to quick-switch
      </div>
    </div>
  );
}
