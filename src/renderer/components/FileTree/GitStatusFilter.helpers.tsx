/**
 * GitStatusFilter.helpers.tsx — internal types, styles, and sub-components for GitStatusFilter.
 * Not part of the public API — do not import from outside FileTree/.
 */

import React from 'react';

import type { DetailedGitStatus } from '../../hooks/useGitStatusDetailed';
import type { TreeFilter } from './fileTreeStore';
import { FileTypeIcon } from './FileTypeIcon';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FilterDef {
  key: TreeFilter;
  label: string;
  shortLabel: string;
}

export interface FilteredFileEntry {
  path: string;
  name: string;
  status: string;
  /** Which set it belongs to: staged/unstaged/both */
  source: 'staged' | 'unstaged' | 'both';
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const FILTERS: FilterDef[] = [
  { key: 'all', label: 'All Files', shortLabel: 'All' },
  { key: 'modified', label: 'Modified', shortLabel: 'M' },
  { key: 'staged', label: 'Staged', shortLabel: 'S' },
  { key: 'untracked', label: 'Untracked', shortLabel: '?' },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

export const filterBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  padding: '4px 8px',
  borderBottom: '1px solid var(--border-subtle)',
};

const filterBtnBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '3px',
  padding: '2px 6px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'transparent',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.6875rem',
  fontWeight: 600,
  fontFamily: 'var(--font-ui)',
  backgroundColor: 'transparent',
  transition: 'all 150ms',
  lineHeight: '18px',
};

const filterBtnActive: React.CSSProperties = {
  ...filterBtnBase,
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
  fontFamily: 'var(--font-mono)',
};

const footerStyle: React.CSSProperties = {
  padding: '4px 12px',
  fontSize: '0.6875rem',
  borderTop: '1px solid var(--border-subtle)',
  textAlign: 'center',
};

const FILTERED_ROW_CSS = `
  .filtered-file-row:hover { background-color: var(--surface-raised); }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getFileName(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? filePath;
}

export function statusColor(status: string): string {
  switch (status) {
    case 'M':
      return 'var(--warning, #e5a50a)';
    case 'A':
      return 'var(--status-success)';
    case 'D':
      return 'var(--status-error)';
    case '?':
      return 'var(--text-faint)';
    case 'R':
      return 'var(--info, #58a6ff)';
    default:
      return 'var(--text-faint)';
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'M':
      return 'Modified';
    case 'A':
      return 'Added';
    case 'D':
      return 'Deleted';
    case '?':
      return 'Untracked';
    case 'R':
      return 'Renamed';
    default:
      return status;
  }
}

export function collectStagedEntries(
  staged: Map<string, string>,
  seen: Set<string>,
): FilteredFileEntry[] {
  const result: FilteredFileEntry[] = [];
  for (const [path, s] of staged) {
    if (!seen.has(path)) {
      seen.add(path);
      result.push({ path, name: getFileName(path), status: s, source: 'staged' });
    }
  }
  return result;
}

export function collectUntrackedEntries(
  unstaged: Map<string, string>,
  seen: Set<string>,
): FilteredFileEntry[] {
  const result: FilteredFileEntry[] = [];
  for (const [path, s] of unstaged) {
    if (s === '?' && !seen.has(path)) {
      seen.add(path);
      result.push({ path, name: getFileName(path), status: s, source: 'unstaged' });
    }
  }
  return result;
}

export function collectModifiedEntries(
  status: DetailedGitStatus,
  seen: Set<string>,
): FilteredFileEntry[] {
  const result: FilteredFileEntry[] = [];
  for (const [path, s] of status.unstaged) {
    if (s !== '?' && !seen.has(path)) {
      seen.add(path);
      result.push({ path, name: getFileName(path), status: s, source: 'unstaged' });
    }
  }
  for (const [path, s] of status.staged) {
    if (!seen.has(path)) {
      seen.add(path);
      result.push({ path, name: getFileName(path), status: s, source: 'staged' });
    }
  }
  return result;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

export function FilterButton({
  def,
  isActive,
  count,
  onClick,
}: {
  def: FilterDef;
  isActive: boolean;
  count: number;
  onClick: () => void;
}): React.ReactElement<any> {
  return (
    <button
      style={isActive ? filterBtnActive : filterBtnBase}
      className={isActive ? 'text-interactive-accent' : 'text-text-semantic-faint'}
      onClick={onClick}
      title={`${def.label} (${count})`}
      aria-pressed={isActive}
      onMouseEnter={(e) => {
        if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)';
      }}
    >
      {def.shortLabel}
      <span
        style={{ fontSize: '0.5625rem', opacity: 0.8 }}
        className={isActive ? 'text-interactive-accent' : 'text-text-semantic-faint'}
      >
        {count}
      </span>
    </button>
  );
}

function StatusBadge({ status }: { status: string }): React.ReactElement<any> {
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
}): React.ReactElement<any> {
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
      <span style={filteredNameStyle} className="text-text-semantic-secondary">
        {entry.path}
      </span>
      <StatusBadge status={entry.status} />
    </div>
  );
}

export function FilteredFileList({
  entries,
  projectRoot,
  filter,
  onFileSelect,
}: {
  entries: FilteredFileEntry[];
  projectRoot: string;
  filter: TreeFilter;
  onFileSelect: (filePath: string) => void;
}): React.ReactElement<any> {
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
      <div style={footerStyle} className="text-text-semantic-faint">
        Showing {entries.length} {filterLabel.toLowerCase()} file{entries.length !== 1 ? 's' : ''}
      </div>
    </>
  );
}
