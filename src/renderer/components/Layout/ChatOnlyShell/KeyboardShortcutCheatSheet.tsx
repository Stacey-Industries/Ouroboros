/**
 * KeyboardShortcutCheatSheet — chat-only keyboard shortcut overlay (Wave 44 Phase C).
 *
 * Listens for TOGGLE_SHORTCUT_CHEATSHEET_EVENT (Ctrl+/) and shows a modal
 * listing chat-only shortcuts grouped by area. Esc closes. Omits IDE-only
 * bindings (terminal, file tree, sidebar panels).
 *
 * Renders via createPortal to float above all chat-only shell layers.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { TOGGLE_SHORTCUT_CHEATSHEET_EVENT } from '../../../hooks/appEventNames';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShortcutEntry {
  keys: string[];
  label: string;
}

interface ShortcutGroup {
  title: string;
  entries: ShortcutEntry[];
}

// ── Data ──────────────────────────────────────────────────────────────────────

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Chat',
    entries: [
      { keys: ['Enter'], label: 'Send message' },
      { keys: ['Shift', 'Enter'], label: 'New line in composer' },
      { keys: ['↑'], label: 'Edit last message' },
      { keys: ['Ctrl', 'K'], label: 'Command palette' },
    ],
  },
  {
    title: 'Settings & Help',
    entries: [
      { keys: ['Ctrl', ','], label: 'Open Settings' },
      { keys: ['Ctrl', '/'], label: 'Keyboard shortcuts' },
    ],
  },
  {
    title: 'Navigation',
    entries: [
      { keys: ['Ctrl', 'Alt', 'I'], label: 'Exit chat mode / toggle IDE' },
      { keys: ['Escape'], label: 'Close overlay / dismiss popover' },
    ],
  },
  {
    title: 'Window',
    entries: [
      { keys: ['Ctrl', 'Shift', 'P'], label: 'Command palette (alternate)' },
      { keys: ['Ctrl', 'W'], label: 'Close window' },
    ],
  },
];

// ── Keyboard key pill ─────────────────────────────────────────────────────────

function KeyPill({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-surface-inset border border-border-subtle text-text-semantic-muted">
      {children}
    </kbd>
  );
}

// ── Shortcut row ──────────────────────────────────────────────────────────────

function ShortcutRow({ entry }: { entry: ShortcutEntry }): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-1.5 gap-4">
      <span className="text-sm text-text-semantic-secondary">{entry.label}</span>
      <div className="flex items-center gap-1 shrink-0">
        {entry.keys.map((k, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-text-semantic-faint text-xs">+</span>}
            <KeyPill>{k}</KeyPill>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Shortcut group ────────────────────────────────────────────────────────────

function ShortcutGroupSection({ group }: { group: ShortcutGroup }): React.ReactElement {
  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-semantic-muted mb-1.5">
        {group.title}
      </h3>
      <div className="divide-y divide-border-subtle">
        {group.entries.map((entry) => (
          <ShortcutRow key={entry.label} entry={entry} />
        ))}
      </div>
    </div>
  );
}

// ── Dismiss hook ──────────────────────────────────────────────────────────────

function useDismissOnEsc(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', handler, { capture: true });
    return () => { document.removeEventListener('keydown', handler, { capture: true }); };
  }, [open, onClose]);
}

// ── Outside-click dismiss hook ────────────────────────────────────────────────

function useOutsideClick(
  open: boolean,
  cardRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent): void => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', handler);
    return () => { document.removeEventListener('pointerdown', handler); };
  }, [open, cardRef, onClose]);
}

// ── Modal overlay ─────────────────────────────────────────────────────────────

interface CheatSheetModalProps {
  onClose: () => void;
}

function CheatSheetModal({ onClose }: CheatSheetModalProps): React.ReactElement {
  const cardRef = useRef<HTMLDivElement>(null);
  useOutsideClick(true, cardRef, onClose);

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      style={{ backgroundColor: 'var(--surface-scrim, rgba(0,0,0,0.45))' }} // rgba: scrim/overlay, not semantic color
      data-testid="cheatsheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        ref={cardRef}
        className="relative flex flex-col bg-surface-panel border border-border-subtle rounded-xl shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto"
        data-testid="cheatsheet-card"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border-subtle shrink-0">
          <h2 className="text-sm font-semibold text-text-semantic-primary">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded text-text-semantic-muted hover:bg-surface-hover transition-colors" /* touch-target-ok */
            aria-label="Close keyboard shortcuts"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="1" y1="1" x2="11" y2="11" /><line x1="11" y1="1" x2="1" y2="11" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">
          {SHORTCUT_GROUPS.map((group) => (
            <ShortcutGroupSection key={group.title} group={group} />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── KeyboardShortcutCheatSheet ────────────────────────────────────────────────

export function KeyboardShortcutCheatSheet(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const handleClose = useCallback((): void => { setOpen(false); }, []);

  useDismissOnEsc(open, handleClose);

  useEffect(() => {
    const handler = (): void => { setOpen((prev) => !prev); };
    window.addEventListener(TOGGLE_SHORTCUT_CHEATSHEET_EVENT, handler);
    return () => { window.removeEventListener(TOGGLE_SHORTCUT_CHEATSHEET_EVENT, handler); };
  }, []);

  if (!open) return <></>;
  return <CheatSheetModal onClose={handleClose} />;
}
