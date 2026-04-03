/**
 * GitStatusFilter - filter buttons for the file tree that filter by git status.
 *
 * When a filter is active, the tree collapses to show only matching files
 * as a flat list with their relative paths.
 */

import React, { useMemo } from 'react';

import type { DetailedGitStatus } from '../../hooks/useGitStatusDetailed';
import { type TreeFilter, useFileTreeStore } from './fileTreeStore';
import {
  collectModifiedEntries,
  collectStagedEntries,
  collectUntrackedEntries,
  filterBarStyle,
  FilterButton,
  FilteredFileList,
  FILTERS,
} from './GitStatusFilter.helpers';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface GitStatusCounts {
  all: number;
  modified: number;
  staged: number;
  untracked: number;
}

export interface GitStatusFilterBarProps {
  counts: GitStatusCounts;
  isRepo: boolean;
}

export interface GitFilteredViewProps {
  status: DetailedGitStatus;
  projectRoot: string;
  onFileSelect: (filePath: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function computeStatusCounts(status: DetailedGitStatus): GitStatusCounts {
  const allPaths = new Set<string>();
  let modified = 0;
  let untracked = 0;

  for (const [path] of status.staged) {
    allPaths.add(path);
  }
  for (const [path, s] of status.unstaged) {
    allPaths.add(path);
    if (s === '?') untracked++;
    else modified++;
  }

  return { all: allPaths.size, modified, staged: status.staged.size, untracked };
}

export function getFilteredFiles(
  status: DetailedGitStatus,
  filter: TreeFilter,
): ReturnType<typeof collectStagedEntries> {
  if (filter === 'all') return [];

  const seen = new Set<string>();
  let result: ReturnType<typeof collectStagedEntries>;

  if (filter === 'staged') {
    result = collectStagedEntries(status.staged, seen);
  } else if (filter === 'untracked') {
    result = collectUntrackedEntries(status.unstaged, seen);
  } else {
    result = collectModifiedEntries(status, seen);
  }

  return result.sort((a, b) => a.path.localeCompare(b.path));
}

// ─── Components ───────────────────────────────────────────────────────────────

/**
 * Filter bar with icon buttons for All / Modified / Staged / Untracked.
 * Reads/writes the filter state from the Zustand store.
 */
export function GitStatusFilterBar({ counts, isRepo }: GitStatusFilterBarProps): React.ReactElement | null {
  const filter = useFileTreeStore((s) => s.filter);
  const setFilter = useFileTreeStore((s) => s.setFilter);

  if (!isRepo || counts.all === 0) return null;

  const countMap: Record<TreeFilter, number> = {
    all: counts.all,
    modified: counts.modified,
    staged: counts.staged,
    untracked: counts.untracked,
  };

  return (
    <div style={filterBarStyle}>
      {FILTERS.map((def) => (
        <FilterButton
          key={def.key}
          def={def}
          isActive={filter === def.key}
          count={countMap[def.key]}
          onClick={() => setFilter(filter === def.key ? 'all' : def.key)}
        />
      ))}
    </div>
  );
}

/**
 * When a filter other than 'all' is active, this replaces the normal tree view
 * with a flat list of matching files.
 */
export function GitFilteredView({ status, projectRoot, onFileSelect }: GitFilteredViewProps): React.ReactElement | null {
  const filter = useFileTreeStore((s) => s.filter);

  const entries = useMemo(
    () => getFilteredFiles(status, filter),
    [status, filter],
  );

  if (filter === 'all') return null;

  return (
    <FilteredFileList
      entries={entries}
      projectRoot={projectRoot}
      filter={filter}
      onFileSelect={onFileSelect}
    />
  );
}
