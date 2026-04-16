/**
 * sessionFilters.ts — Pure helper for applying sidebar filters to a session list.
 *
 * All filters are AND-composed. Passing the default FilterState returns the
 * original array unchanged (all filters at their 'all' / empty defaults).
 *
 * Pinned sessions sort to the top within any view that isn't exclusively
 * archived-only or deleted-only (where pinned is irrelevant and not surfaced).
 */

import type { SessionRecord } from '../../types/electron';

// ─── Filter state types ───────────────────────────────────────────────────────

export type StatusFilter =
  | 'all'
  | 'active'
  | 'pinned'
  | 'archived'
  | 'deleted'
  | 'queued'
  | 'errored';
export type WorktreeFilter = 'all' | 'worktree' | 'no-worktree';

export interface FilterState {
  status: StatusFilter;
  /** Free-text: matches against projectRoot basename (case-insensitive substring). */
  project: string;
  worktree: WorktreeFilter;
}

export const DEFAULT_FILTER_STATE: FilterState = {
  status: 'all',
  project: '',
  worktree: 'all',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function projectBasename(root: string): string {
  return root.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? root;
}

function matchesStatus(session: SessionRecord, status: StatusFilter): boolean {
  if (status === 'all') return !session.deletedAt;
  if (status === 'active') return !session.archivedAt && !session.deletedAt;
  if (status === 'pinned') return Boolean(session.pinned) && !session.deletedAt;
  if (status === 'archived') return Boolean(session.archivedAt) && !session.deletedAt;
  if (status === 'deleted') return Boolean(session.deletedAt);
  // 'queued' and 'errored' are placeholder states — no sessions carry these yet.
  return false;
}

function matchesProject(session: SessionRecord, project: string): boolean {
  if (!project.trim()) return true;
  const name = projectBasename(session.projectRoot).toLowerCase();
  return name.includes(project.trim().toLowerCase());
}

function matchesWorktree(session: SessionRecord, worktree: WorktreeFilter): boolean {
  if (worktree === 'all') return true;
  if (worktree === 'worktree') return session.worktree;
  return !session.worktree;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Apply all filters, then sort pinned sessions to the top.
 *
 * Pinned sort is suppressed in the 'archived' and 'deleted' views (every item
 * is already in a special state; pinned ordering would be confusing).
 */
export function applyFilters(
  sessions: SessionRecord[],
  filters: FilterState,
): SessionRecord[] {
  const filtered = sessions.filter(
    (s) =>
      matchesStatus(s, filters.status) &&
      matchesProject(s, filters.project) &&
      matchesWorktree(s, filters.worktree),
  );

  const suppressPinnedSort = filters.status === 'archived' || filters.status === 'deleted';
  if (suppressPinnedSort) return filtered;

  return [...filtered].sort((a, b) => {
    const pa = a.pinned ? 1 : 0;
    const pb = b.pinned ? 1 : 0;
    return pb - pa; // pinned (1) sorts before unpinned (0)
  });
}
