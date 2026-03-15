/**
 * GitStatusFilter - filter buttons for the file tree that filter by git status.
 *
 * When a filter is active, the tree collapses to show only matching files
 * as a flat list with their relative paths.
 */

import React, { useMemo } from 'react';
import { useFileTreeStore, type TreeFilter } from './fileTreeStore';
import type { DetailedGitStatus } from '../../hooks/useGitStatusDetailed';
import { FileTypeIcon } from './FileTypeIcon';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FilterDef {
  key: TreeFilter;
  label: string;
  shortLabel: string;
}

interface FilteredFileEntry {
  path: string;
  name: string;
  status: string;
  /** Which set it belongs to: staged/unstaged/both */
  source: 'staged' | 'unstaged' | 'both';
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FILTERS: FilterDef[] = [
  { key: 'all', label: 'All Files', shortLabel: 'All' },
  { key: 'modified', label: 'Modified', shortLabel: 'M' },
  { key: 'staged', label: 'Staged', shortLabel: 'S' },
  { key: 'untracked', label: 'Untracked', shortLabel: '?' },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const filterBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  padding: '4px 8px',
  borderBottom: '1px solid var(--border-muted)',
};

const filterBtnBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '3px',
  padding: '2px 6px',
  border: '1px solid transparent',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.6875rem',
  fontWeight: 600,
  fontFamily: 'var(--font-ui)',
  background: 'transparent',
  color: 'var(--text-faint)',
  transition: 'all 150ms',
  lineHeight: '18px',
};

const filterBtnActive: React.CSSProperties = {
  ...filterBtnBase,
  color: 'var(--accent)',
  backgroundColor: 'rgba(var(--accent-rgb, 88, 166, 255), 0.1)',
  borderColor: 'rgba(var(--accent-rgb, 88, 166, 255), 0.3)',
};

const filteredListStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
};

const filteredRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px 12px',
  cursor: 'pointer',
  height: '26px',
  boxSizing: 'border-box',
  userSelect: 'none',
};

const filteredNameStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '0.8125rem',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-mono)',
};

const footerStyle: React.CSSProperties = {
  padding: '4px 12px',
  fontSize: '0.6875rem',
  color: 'var(--text-faint)',
  borderTop: '1px solid var(--border-muted)',
  textAlign: 'center',
};

const FILTERED_ROW_CSS = `
  .filtered-file-row:hover { background-color: var(--bg-tertiary); }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFileName(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? filePath;
}

function statusColor(status: string): string {
  switch (status) {
    case 'M': return 'var(--warning, #e5a50a)';
    case 'A': return 'var(--success, #3fb950)';
    case 'D': return 'var(--error, #f85149)';
    case '?': return 'var(--text-faint)';
    case 'R': return 'var(--info, #58a6ff)';
    default: return 'var(--text-faint)';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'M': return 'Modified';
    case 'A': return 'Added';
    case 'D': return 'Deleted';
    case '?': return 'Untracked';
    case 'R': return 'Renamed';
    default: return status;
  }
}

export interface GitStatusCounts {
  all: number;
  modified: number;
  staged: number;
  untracked: number;
}

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

  return {
    all: allPaths.size,
    modified,
    staged: status.staged.size,
    untracked,
  };
}

export function getFilteredFiles(
  status: DetailedGitStatus,
  filter: TreeFilter,
): FilteredFileEntry[] {
  if (filter === 'all') return [];

  const result: FilteredFileEntry[] = [];
  const seen = new Set<string>();

  if (filter === 'staged') {
    for (const [path, s] of status.staged) {
      if (!seen.has(path)) {
        seen.add(path);
        result.push({ path, name: getFileName(path), status: s, source: 'staged' });
      }
    }
  } else if (filter === 'untracked') {
    for (const [path, s] of status.unstaged) {
      if (s === '?' && !seen.has(path)) {
        seen.add(path);
        result.push({ path, name: getFileName(path), status: s, source: 'unstaged' });
      }
    }
  } else if (filter === 'modified') {
    // Unstaged modifications (not untracked)
    for (const [path, s] of status.unstaged) {
      if (s !== '?' && !seen.has(path)) {
        seen.add(path);
        result.push({ path, name: getFileName(path), status: s, source: 'unstaged' });
      }
    }
    // Staged modifications not already listed
    for (const [path, s] of status.staged) {
      if (!seen.has(path)) {
        seen.add(path);
        result.push({ path, name: getFileName(path), status: s, source: 'staged' });
      }
    }
  }

  return result.sort((a, b) => a.path.localeCompare(b.path));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterButton({
  def,
  isActive,
  count,
  onClick,
}: {
  def: FilterDef;
  isActive: boolean;
  count: number;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      style={isActive ? filterBtnActive : filterBtnBase}
      onClick={onClick}
      title={`${def.label} (${count})`}
      aria-pressed={isActive}
      onMouseEnter={(e) => {
        if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)';
      }}
    >
      {def.shortLabel}
      <span style={{ fontSize: '0.5625rem', color: isActive ? 'var(--accent)' : 'var(--text-faint)', opacity: 0.8 }}>
        {count}
      </span>
    </button>
  );
}

function StatusBadge({ status }: { status: string }): React.ReactElement {
  return (
    <span
      title={statusLabel(status)}
      style={{
        flexShrink: 0,
        fontSize: '0.625rem',
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        color: statusColor(status),
        width: '14px',
        textAlign: 'center',
        lineHeight: 1,
      }}
    >
      {status}
    </span>
  );
}

function FilteredFileRow({
  entry,
  projectRoot,
  onFileSelect,
}: {
  entry: FilteredFileEntry;
  projectRoot: string;
  onFileSelect: (filePath: string) => void;
}): React.ReactElement {
  const sep = projectRoot.includes('/') ? '/' : '\\';
  const absolutePath = `${projectRoot}${sep}${entry.path.replace(/\//g, sep)}`;

  return (
    <div
      className="filtered-file-row"
      style={filteredRowStyle}
      onClick={() => onFileSelect(absolutePath)}
      title={entry.path}
      role="listitem"
    >
      <FileTypeIcon filename={entry.name} />
      <span style={filteredNameStyle}>{entry.path}</span>
      <StatusBadge status={entry.status} />
    </div>
  );
}

function FilteredFileList({
  entries,
  projectRoot,
  filter,
  onFileSelect,
}: {
  entries: FilteredFileEntry[];
  projectRoot: string;
  filter: TreeFilter;
  onFileSelect: (filePath: string) => void;
}): React.ReactElement {
  const filterLabel = FILTERS.find((f) => f.key === filter)?.label ?? filter;

  return (
    <>
      <style>{FILTERED_ROW_CSS}</style>
      <div style={filteredListStyle} role="list" aria-label={`${filterLabel} files`}>
        {entries.map((entry) => (
          <FilteredFileRow
            key={entry.path}
            entry={entry}
            projectRoot={projectRoot}
            onFileSelect={onFileSelect}
          />
        ))}
      </div>
      <div style={footerStyle}>
        Showing {entries.length} {filterLabel.toLowerCase()} file{entries.length !== 1 ? 's' : ''}
      </div>
    </>
  );
}

// ─── Main components ─────────────────────────────────────────────────────────

export interface GitStatusFilterBarProps {
  counts: GitStatusCounts;
  isRepo: boolean;
}

/**
 * Filter bar with icon buttons for All / Modified / Staged / Untracked.
 * Reads/writes the filter state from the Zustand store.
 */
export function GitStatusFilterBar({ counts, isRepo }: GitStatusFilterBarProps): React.ReactElement | null {
  const filter = useFileTreeStore((s) => s.filter);
  const setFilter = useFileTreeStore((s) => s.setFilter);

  if (!isRepo) return null;

  const countMap: Record<TreeFilter, number> = {
    all: counts.all,
    modified: counts.modified,
    staged: counts.staged,
    untracked: counts.untracked,
  };

  // Only show if there are any changes
  if (counts.all === 0) return null;

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

export interface GitFilteredViewProps {
  status: DetailedGitStatus;
  projectRoot: string;
  onFileSelect: (filePath: string) => void;
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
