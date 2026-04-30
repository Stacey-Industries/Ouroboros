/**
 * NewSessionButton — CTA to create a new session (Wave 20 Phase A).
 *
 * Opens the native folder-picker dialog, then calls sessionCrud:create
 * with the chosen project root.  Respects the sessions.worktreePerSession
 * config flag but does not surface a toggle UI until Phase E.
 */

import React, { useCallback, useState } from 'react';

import type { SessionRecord } from '../../types/electron';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI);
}

async function pickProjectRoot(): Promise<string | null> {
  if (!hasElectronAPI()) return null;
  const result = await window.electronAPI.files.selectFolder();
  if (!result.success || !result.path) return null;
  return result.path;
}

async function createStoredSession(projectRoot: string): Promise<SessionRecord | null> {
  if (!hasElectronAPI()) return null;
  const result = await window.electronAPI.sessionCrud.create(projectRoot);
  return result.success && result.session ? result.session : null;
}

export async function createStoredSessionFromPicker(): Promise<SessionRecord | null> {
  const projectRoot = await pickProjectRoot();
  if (!projectRoot) return null;
  return createStoredSession(projectRoot);
}

export async function createStoredSessionInProject(
  projectRoot: string,
): Promise<SessionRecord | null> {
  return createStoredSession(projectRoot);
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface NewSessionButtonProps {
  /** Called after a session is successfully created. */
  onCreated?: () => void;
}

export function NewSessionButton({ onCreated }: NewSessionButtonProps): React.ReactElement {
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const session = await createStoredSessionFromPicker();
      if (!session) return;
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }, [busy, onCreated]);

  return (
    <button
      type="button"
      disabled={busy}
      aria-label="Create new session"
      aria-busy={busy}
      onClick={() => void handleClick()}
      className={[
        'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium',
        'bg-interactive-accent text-text-on-accent',
        'hover:bg-interactive-hover disabled:opacity-50 disabled:cursor-not-allowed',
        'transition-colors',
      ].join(' ')}
    >
      <span aria-hidden="true">+</span>
      <span>New</span>
    </button>
  );
}
