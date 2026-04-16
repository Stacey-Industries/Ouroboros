/**
 * SessionRow — single session entry in the session sidebar.
 *
 * Shows: relative last-used time, project basename, worktree badge,
 * status pill, and action buttons (pin, archive restore, delete restore).
 *
 * Wave 21 Phase C additions:
 *   - Star/pin icon button (toggles pinned state)
 *   - "Deleted — restore in N days" badge + Restore button for soft-deleted sessions
 */

import React, { useCallback, useState } from 'react';

import type { SessionRecord } from '../../types/electron';

// ─── Constants ────────────────────────────────────────────────────────────────

const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

function projectBasename(root: string): string {
  return root.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? root;
}

function statusLabel(session: SessionRecord): string {
  if (session.deletedAt) return 'trash';
  if (session.archivedAt) return 'archived';
  return 'active';
}

function daysUntilPurge(deletedAt: number): number {
  const expiresAt = deletedAt + THIRTY_DAYS_MS;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 3600 * 1000)));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatusPillProps { label: string }

function StatusPill({ label }: StatusPillProps): React.ReactElement {
  const cls =
    label === 'archived' ? 'bg-status-warning-subtle text-status-warning' :
    label === 'trash'    ? 'bg-status-error-subtle text-status-error' :
    'bg-status-success-subtle text-status-success';
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${cls}`}>
      {label}
    </span>
  );
}

interface PinButtonProps { sessionId: string; pinned: boolean; onToggled?: () => void }

function PinButton({ sessionId, pinned, onToggled }: PinButtonProps): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const handle = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.electronAPI) return;
    setBusy(true);
    await window.electronAPI.sessionCrud.pin(sessionId, !pinned);
    setBusy(false);
    onToggled?.();
  }, [sessionId, pinned, onToggled]);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={handle}
      aria-label={pinned ? 'Unpin session' : 'Pin session'}
      className={`shrink-0 text-sm leading-none transition-colors
        ${pinned ? 'text-interactive-accent' : 'text-text-semantic-faint hover:text-interactive-accent'}`}
    >
      {pinned ? '★' : '☆'}
    </button>
  );
}

interface RestoreButtonProps { sessionId: string; label: string; onRestored?: () => void }

function RestoreButton({ sessionId, label, onRestored }: RestoreButtonProps): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const handle = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.electronAPI) return;
    setBusy(true);
    await window.electronAPI.sessionCrud.restore(sessionId);
    setBusy(false);
    onRestored?.();
  }, [sessionId, onRestored]);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={handle}
      className="mt-1 self-start text-xs px-2 py-0.5 rounded bg-interactive-muted
        text-text-semantic-secondary hover:bg-interactive-hover transition-colors"
    >
      {busy ? 'Restoring…' : label}
    </button>
  );
}

interface RestoreDeletedButtonProps { sessionId: string; onRestored?: () => void }

function RestoreDeletedButton({ sessionId, onRestored }: RestoreDeletedButtonProps): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const handle = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.electronAPI) return;
    setBusy(true);
    await window.electronAPI.sessionCrud.restoreDeleted(sessionId);
    setBusy(false);
    onRestored?.();
  }, [sessionId, onRestored]);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={handle}
      className="mt-1 self-start text-xs px-2 py-0.5 rounded bg-interactive-muted
        text-text-semantic-secondary hover:bg-interactive-hover transition-colors"
    >
      {busy ? 'Restoring…' : 'Restore'}
    </button>
  );
}

// ─── SessionRowBody ───────────────────────────────────────────────────────────

interface SessionRowBodyProps { session: SessionRecord; onToggled?: () => void }

function SessionRowBody({ session, onToggled }: SessionRowBodyProps): React.ReactElement {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text-semantic-primary truncate">
          {projectBasename(session.projectRoot)}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <PinButton sessionId={session.id} pinned={Boolean(session.pinned)} onToggled={onToggled} />
          <span className="text-xs text-text-semantic-faint">{relativeTime(session.lastUsedAt)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-text-semantic-muted font-mono">{session.id.slice(0, 8)}</span>
        {session.worktree && (
          <span className="text-xs bg-interactive-accent-subtle text-text-semantic-primary px-1 rounded">
            worktree
          </span>
        )}
        <StatusPill label={statusLabel(session)} />
      </div>
    </>
  );
}

// ─── Inline badges ────────────────────────────────────────────────────────────

interface DeletedBadgeProps { session: SessionRecord; onRestored?: () => void }

function DeletedBadge({ session, onRestored }: DeletedBadgeProps): React.ReactElement | null {
  if (!session.deletedAt) return null;
  const days = daysUntilPurge(session.deletedAt);
  return (
    <div className="mt-1 flex flex-col gap-0.5">
      <span className="text-xs text-status-error">
        Deleted — purged in {days} day{days !== 1 ? 's' : ''}
      </span>
      <RestoreDeletedButton sessionId={session.id} onRestored={onRestored} />
    </div>
  );
}

// ─── SessionRow ───────────────────────────────────────────────────────────────

export interface SessionRowProps {
  session: SessionRecord;
  isActive: boolean;
  onClick: (sessionId: string) => void;
  onRestored?: () => void;
}

export function SessionRow({
  session, isActive, onClick, onRestored,
}: SessionRowProps): React.ReactElement {
  const handleClick = useCallback(() => onClick(session.id), [onClick, session.id]);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') onClick(session.id); },
    [onClick, session.id],
  );
  const activeCls = isActive
    ? 'bg-interactive-selection border-l-2 border-interactive-accent'
    : 'hover:bg-surface-hover border-l-2 border-transparent';
  return (
    <div
      role="row"
      aria-selected={isActive}
      tabIndex={0}
      className={`flex flex-col gap-0.5 px-3 py-2 cursor-pointer transition-colors ${activeCls}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`${projectBasename(session.projectRoot)}, last used ${relativeTime(session.lastUsedAt)}`}
    >
      <div role="gridcell" className="flex flex-col gap-0.5 min-w-0">
        <SessionRowBody session={session} onToggled={onRestored} />
        {session.archivedAt && !session.deletedAt && (
          <RestoreButton sessionId={session.id} label="Restore" onRestored={onRestored} />
        )}
        {session.deletedAt && <DeletedBadge session={session} onRestored={onRestored} />}
      </div>
    </div>
  );
}
