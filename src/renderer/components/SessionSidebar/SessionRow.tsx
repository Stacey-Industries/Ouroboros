/**
 * SessionRow — single session entry in the session sidebar (Wave 20 Phase A).
 *
 * Shows: relative last-used time, project basename, worktree badge (if active),
 * status pill, and archived indicator.
 */

import React, { useCallback } from 'react';

import type { SessionRecord } from '../../types/electron';

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
  if (session.archivedAt) return 'archived';
  return 'active';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatusPillProps { label: string }

function StatusPill({ label }: StatusPillProps): React.ReactElement {
  const isArchived = label === 'archived';
  const cls = isArchived
    ? 'bg-status-warning-subtle text-status-warning'
    : 'bg-status-success-subtle text-status-success';
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ─── SessionRow ───────────────────────────────────────────────────────────────

export interface SessionRowProps {
  session: SessionRecord;
  isActive: boolean;
  onClick: (sessionId: string) => void;
}

interface SessionRowBodyProps { session: SessionRecord }

function SessionRowBody({ session }: SessionRowBodyProps): React.ReactElement {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text-semantic-primary truncate">
          {projectBasename(session.projectRoot)}
        </span>
        <span className="text-xs text-text-semantic-faint shrink-0" aria-label="last used">
          {relativeTime(session.lastUsedAt)}
        </span>
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

export function SessionRow({ session, isActive, onClick }: SessionRowProps): React.ReactElement {
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
      aria-label={`Session ${session.id.slice(0, 8)} — ${projectBasename(session.projectRoot)}`}
    >
      <SessionRowBody session={session} />
    </div>
  );
}
