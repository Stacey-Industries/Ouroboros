/**
 * sessionFilters.ts — Pure helper for applying sidebar filters to a session list.
 *
 * All filters are AND-composed. Passing the default FilterState returns the
 * original array unchanged (all filters at their 'all' / empty defaults).
 */

import type { SessionRecord } from '../../types/electron';

// ─── Filter state types ───────────────────────────────────────────────────────

export type StatusFilter = 'all' | 'active' | 'archived' | 'queued' | 'errored';
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
  if (status === 'all') return true;
  if (status === 'active') return !session.archivedAt;
  if (status === 'archived') return Boolean(session.archivedAt);
  // 'queued' and 'errored' are placeholder states for future waves — no sessions
  // carry these values yet, so these filters produce an empty result intentionally.
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

export function applyFilters(
  sessions: SessionRecord[],
  filters: FilterState,
): SessionRecord[] {
  return sessions.filter(
    (s) =>
      matchesStatus(s, filters.status) &&
      matchesProject(s, filters.project) &&
      matchesWorktree(s, filters.worktree),
  );
}
