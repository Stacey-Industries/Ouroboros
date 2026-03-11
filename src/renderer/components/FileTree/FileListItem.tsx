import React from 'react';
import { getFileIcon } from './fileIcons';

export interface FileEntry {
  /** Absolute path on disk */
  path: string;
  /** Relative path from project root */
  relativePath: string;
  /** Filename only (basename) */
  name: string;
  /** Parent directory relative path */
  dir: string;
  /** File size in bytes */
  size: number;
}

export interface MatchRange {
  start: number;
  end: number;
}

export interface FileListItemProps {
  file: FileEntry;
  isActive: boolean;
  isFocused: boolean;
  /** Ranges in the filename that matched the search query */
  matchRanges?: MatchRange[];
  onClick: (file: FileEntry) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Renders the filename with highlighted match ranges.
 */
function HighlightedName({
  name,
  ranges,
}: {
  name: string;
  ranges?: MatchRange[];
}): React.ReactElement {
  if (!ranges || ranges.length === 0) {
    return <span>{name}</span>;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (cursor < range.start) {
      parts.push(
        <span key={`plain-${cursor}`}>{name.slice(cursor, range.start)}</span>
      );
    }
    parts.push(
      <span
        key={`match-${range.start}`}
        style={{
          color: 'var(--accent)',
          fontWeight: 600,
        }}
      >
        {name.slice(range.start, range.end)}
      </span>
    );
    cursor = range.end;
  }

  if (cursor < name.length) {
    parts.push(<span key={`plain-end`}>{name.slice(cursor)}</span>);
  }

  return <>{parts}</>;
}

export function FileListItem({
  file,
  isActive,
  isFocused,
  matchRanges,
  onClick,
}: FileListItemProps): React.ReactElement {
  const icon = getFileIcon(file.name);

  return (
    <div
      role="option"
      aria-selected={isActive}
      onClick={() => onClick(file)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 12px',
        cursor: 'pointer',
        backgroundColor: isActive
          ? 'var(--bg-tertiary)'
          : isFocused
          ? 'rgba(88, 166, 255, 0.08)'
          : 'transparent',
        borderLeft: isActive
          ? '2px solid var(--accent)'
          : '2px solid transparent',
        userSelect: 'none',
        minHeight: '32px',
        boxSizing: 'border-box',
      }}
    >
      {/* File type indicator dot */}
      <span
        aria-hidden="true"
        title={icon.label}
        style={{
          flexShrink: 0,
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: icon.color,
        }}
      />

      {/* Filename + directory */}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <span
          style={{
            display: 'block',
            fontSize: '0.8125rem',
            color: isActive ? 'var(--text)' : 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <HighlightedName name={file.name} ranges={matchRanges} />
        </span>
        {file.dir && (
          <span
            style={{
              display: 'block',
              fontSize: '0.6875rem',
              color: 'var(--text-faint)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {file.dir}
          </span>
        )}
      </span>

      {/* File size */}
      <span
        style={{
          flexShrink: 0,
          fontSize: '0.6875rem',
          color: 'var(--text-faint)',
          whiteSpace: 'nowrap',
        }}
      >
        {formatSize(file.size)}
      </span>
    </div>
  );
}
