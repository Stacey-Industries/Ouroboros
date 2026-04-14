/**
 * RestoreSessionsDialog — modal shown at startup when persisted PTY sessions
 * exist and `persistTerminalSessions` is enabled.
 *
 * Lazy-loaded by InnerAppLayout so it does not affect cold-start bundle size.
 */

import React, { useState } from 'react';

import type { PersistedSessionInfo } from '../../types/electron';

interface Props {
  sessions: PersistedSessionInfo[];
  onRestoreAll: () => void;
  onRestoreSelected: (ids: string[]) => void;
  onDiscard: () => void;
  onDismiss: () => void;
}

function formatCwd(cwd: string): string {
  const parts = cwd.replace(/\\/g, '/').split('/');
  return parts.slice(-2).join('/') || cwd;
}

function formatShell(shellPath: string | null): string {
  if (!shellPath) return 'shell';
  const parts = shellPath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? 'shell';
}

function formatAge(lastSeenAt: number): string {
  const ms = Date.now() - lastSeenAt;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function SessionRow({
  session,
  selected,
  onToggle,
}: {
  session: PersistedSessionInfo;
  selected: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-surface-hover">
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="accent-interactive-accent"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-xs text-text-semantic-primary">
          {formatCwd(session.cwd)}
        </span>
        <span className="text-xs text-text-semantic-muted">
          {formatShell(session.shellPath)} · {formatAge(session.lastSeenAt)}
        </span>
      </span>
    </label>
  );
}

interface ActionButtonsProps {
  count: number;
  selectedCount: number;
  onRestoreAll: () => void;
  onRestoreSelected: () => void;
  onDiscard: () => void;
}

function ActionButtons({
  count,
  selectedCount,
  onRestoreAll,
  onRestoreSelected,
  onDiscard,
}: ActionButtonsProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={onRestoreAll}
        className="rounded bg-interactive-accent px-3 py-1.5 text-xs font-medium text-text-on-accent hover:bg-interactive-hover"
      >
        Restore all ({count})
      </button>
      <button
        onClick={onRestoreSelected}
        disabled={selectedCount === 0}
        className="rounded border border-border-semantic px-3 py-1.5 text-xs font-medium text-text-semantic-primary hover:bg-surface-hover disabled:opacity-40"
      >
        Restore selected ({selectedCount})
      </button>
      <button
        onClick={onDiscard}
        className="rounded px-3 py-1.5 text-xs text-text-semantic-muted hover:bg-surface-hover"
      >
        Discard all
      </button>
    </div>
  );
}

interface DialogContentProps extends Props {
  selected: Set<string>;
  onToggle: (id: string) => void;
}

function DialogContent({
  sessions,
  selected,
  onToggle,
  onRestoreAll,
  onRestoreSelected,
  onDiscard,
  onDismiss,
}: DialogContentProps): React.ReactElement {
  const count = sessions.length;
  return (
    <div className="w-full max-w-sm rounded-lg border border-border-semantic bg-surface-panel p-5 shadow-lg">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 id="restore-dialog-title" className="text-sm font-semibold text-text-semantic-primary">
          Restore previous terminals?
        </h2>
        <button onClick={onDismiss} className="text-text-semantic-muted hover:text-text-semantic-primary" aria-label="Not now">
          ✕
        </button>
      </div>
      <p className="mb-3 text-xs text-text-semantic-secondary">
        Ouroboros saved {count} terminal session{count !== 1 ? 's' : ''} from your last run.
        Restoring will open fresh shells with the same working directory. Running processes cannot
        be resumed.
      </p>
      <div className="mb-4 max-h-48 overflow-y-auto rounded border border-border-subtle bg-surface-inset">
        {sessions.map((s) => (
          <SessionRow key={s.id} session={s} selected={selected.has(s.id)} onToggle={() => onToggle(s.id)} />
        ))}
      </div>
      <ActionButtons
        count={count}
        selectedCount={selected.size}
        onRestoreAll={onRestoreAll}
        onRestoreSelected={() => onRestoreSelected([...selected])}
        onDiscard={onDiscard}
      />
    </div>
  );
}

export function RestoreSessionsDialog({
  sessions,
  onRestoreAll,
  onRestoreSelected,
  onDiscard,
  onDismiss,
}: Props): React.ReactElement {
  const [selected, setSelected] = useState<Set<string>>(new Set(sessions.map((s) => s.id)));

  function toggleSession(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-overlay" role="dialog" aria-modal="true" aria-labelledby="restore-dialog-title">
      <DialogContent
        sessions={sessions}
        selected={selected}
        onToggle={toggleSession}
        onRestoreAll={onRestoreAll}
        onRestoreSelected={onRestoreSelected}
        onDiscard={onDiscard}
        onDismiss={onDismiss}
      />
    </div>
  );
}
