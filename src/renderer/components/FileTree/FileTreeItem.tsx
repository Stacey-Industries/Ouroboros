import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FileTypeIcon, FolderTypeIcon } from './FileTypeIcon';
import type { GitFileStatus } from '../../types/electron';

// Re-export these types so existing consumers still work
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

export interface TreeNode {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  depth: number;
  children?: TreeNode[]; // undefined = not loaded, [] = empty
  isExpanded?: boolean;
  isLoading?: boolean;
}

/** A flattened row for virtualised rendering. */
export interface FlatRow {
  node: TreeNode;
  depth: number;
}

export interface FileTreeItemProps {
  node: TreeNode;
  depth: number;
  isActive: boolean;
  isFocused: boolean;
  /** When in search mode, show a flat file item with match highlights */
  searchMode?: boolean;
  matchRanges?: MatchRange[];
  /** Git status for this specific file/folder ('M', 'A', 'D', '?', 'R') */
  gitStatus?: GitFileStatus;
  /** Whether this item is currently being renamed inline */
  isEditing?: boolean;
  /** The initial value to show in the inline edit input */
  editValue?: string;
  /** Called when the inline edit is confirmed */
  onEditConfirm?: (newName: string) => void;
  /** Called when the inline edit is cancelled */
  onEditCancel?: () => void;
  /** Whether this path is currently bookmarked */
  isBookmarked?: boolean;
  /** Whether this item is part of the current multi-selection */
  isSelected?: boolean;
  onClick: (node: TreeNode, e?: React.MouseEvent) => void;
  onDoubleClick?: (node: TreeNode) => void;
  onContextMenu?: (e: React.MouseEvent, node: TreeNode) => void;
  onDragOver?: (e: React.DragEvent, node: TreeNode) => void;
  onDrop?: (e: React.DragEvent, targetNode: TreeNode) => void;
}

/** Characters not allowed in file/folder names */
const INVALID_NAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/;

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

/** Map git status to a CSS color variable. */
function gitStatusColor(status: GitFileStatus | undefined): string | undefined {
  switch (status) {
    case 'M':
      return 'var(--git-modified)';
    case 'A':
    case 'R':
      return 'var(--git-added)';
    case 'D':
      return 'var(--git-deleted)';
    case '?':
      return 'var(--git-untracked)';
    default:
      return undefined;
  }
}

/** Map git status to a display label. */
function gitStatusLabel(status: GitFileStatus | undefined): string | undefined {
  switch (status) {
    case 'M':
      return 'M';
    case 'A':
      return 'A';
    case 'D':
      return 'D';
    case '?':
      return 'U';
    case 'R':
      return 'R';
    default:
      return undefined;
  }
}

/** Chevron SVG for folder expand/collapse. */
function Chevron({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      style={{
        flexShrink: 0,
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 120ms ease',
        fill: 'var(--text-muted)',
      }}
    >
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// FolderIcon is now rendered via FolderTypeIcon from FileTypeIcon.tsx

/**
 * Inline edit input shown when renaming or creating a new item.
 */
function InlineEditInput({
  initialValue,
  onConfirm,
  onCancel,
}: {
  initialValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      // Select the name without extension for files
      const dotIndex = initialValue.lastIndexOf('.');
      if (dotIndex > 0) {
        inputRef.current.setSelectionRange(0, dotIndex);
      } else {
        inputRef.current.select();
      }
    }
  }, [initialValue]);

  const validate = useCallback((name: string): string | null => {
    if (name.trim().length === 0) return 'Name cannot be empty';
    if (INVALID_NAME_CHARS.test(name)) return 'Name contains invalid characters';
    if (name === '.' || name === '..') return 'Invalid name';
    return null;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        const validationError = validate(value);
        if (validationError) {
          setError(validationError);
          return;
        }
        onConfirm(value.trim());
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [value, validate, onConfirm, onCancel]
  );

  const handleBlur = useCallback(() => {
    const validationError = validate(value);
    if (validationError || value.trim() === initialValue) {
      onCancel();
    } else {
      onConfirm(value.trim());
    }
  }, [value, initialValue, validate, onConfirm, onCancel]);

  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{
          width: '100%',
          padding: '0 4px',
          background: 'var(--bg)',
          border: error ? '1px solid var(--error, #e55)' : '1px solid var(--accent)',
          borderRadius: '2px',
          color: 'var(--text)',
          fontSize: '0.8125rem',
          fontFamily: 'var(--font-mono)',
          outline: 'none',
          boxSizing: 'border-box',
          height: '20px',
          lineHeight: '20px',
        }}
      />
      {error && (
        <div
          style={{
            position: 'absolute',
            top: '22px',
            left: 0,
            right: 0,
            padding: '2px 6px',
            background: 'var(--bg-secondary, var(--bg))',
            border: '1px solid var(--error, #e55)',
            borderRadius: '2px',
            color: 'var(--error, #e55)',
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-ui)',
            zIndex: 10,
            whiteSpace: 'nowrap',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

export function FileTreeItem({
  node,
  depth,
  isActive,
  isFocused,
  searchMode,
  matchRanges,
  gitStatus,
  isEditing,
  editValue,
  onEditConfirm,
  onEditCancel,
  isBookmarked,
  isSelected,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragOver,
  onDrop,
}: FileTreeItemProps): React.ReactElement {
  // icon is now rendered directly by FileTypeIcon / FolderTypeIcon
  const indent = depth * 16;
  const statusColor = gitStatusColor(gitStatus);
  const statusLbl = gitStatusLabel(gitStatus);
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      role="option"
      aria-selected={isActive}
      draggable={!isEditing}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', node.path);
        e.dataTransfer.setData(
          'application/json',
          JSON.stringify({ path: node.path, isDirectory: node.isDirectory, name: node.name })
        );
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        // External OS file drops use 'copy'; internal tree drags use 'move'
        const isExternal = e.dataTransfer.types.includes('Files');
        e.dataTransfer.dropEffect = isExternal ? 'copy' : 'move';
        if (onDragOver) onDragOver(e, node);
      }}
      onDragLeave={(e) => {
        // Only clear if we're truly leaving this element (not entering a child)
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDragOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        if (onDrop) onDrop(e, node);
      }}
      onClick={(e) => {
        if (!isEditing) onClick(node, e);
      }}
      onDoubleClick={() => {
        if (!isEditing && onDoubleClick) onDoubleClick(node);
      }}
      onContextMenu={(e) => {
        if (onContextMenu && !isEditing) {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(e, node);
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        paddingLeft: `${indent + 4}px`,
        paddingRight: '8px',
        cursor: 'pointer',
        backgroundColor: isDragOver
          ? 'rgba(var(--accent-rgb, 88, 166, 255), 0.15)'
          : isActive
          ? 'rgba(var(--accent-rgb, 88, 166, 255), 0.1)'
          : isSelected
          ? 'rgba(var(--accent-rgb, 88, 166, 255), 0.08)'
          : isFocused
          ? 'var(--bg-tertiary)'
          : 'transparent',
        outline: isDragOver ? '1px dashed var(--accent)' : undefined,
        borderLeft: isActive
          ? '2px solid var(--accent)'
          : '2px solid transparent',
        userSelect: 'none',
        height: '28px',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* Indent guides */}
      {depth > 0 && !searchMode &&
        Array.from({ length: depth }, (_, i) => (
          <span
            key={`guide-${i}`}
            style={{
              position: 'absolute',
              left: `${i * 16 + 12}px`,
              top: 0,
              bottom: 0,
              width: '1px',
              backgroundColor: 'var(--border-muted)',
              opacity: 0.4,
            }}
          />
        ))}

      {node.isDirectory ? (
        <>
          <Chevron expanded={!!node.isExpanded} />
          <FolderTypeIcon name={node.name} open={!!node.isExpanded} />
          {isEditing && onEditConfirm && onEditCancel ? (
            <InlineEditInput
              initialValue={editValue ?? node.name}
              onConfirm={onEditConfirm}
              onCancel={onEditCancel}
            />
          ) : (
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '0.8125rem',
                fontWeight: 500,
                color: statusColor ?? 'var(--text)',
                fontFamily: 'var(--font-ui)',
              }}
            >
              {node.name}
            </span>
          )}
          {/* Child count — only when collapsed and children are loaded */}
          {!isEditing && !node.isExpanded && node.children !== undefined && (
            <span
              style={{
                flexShrink: 0,
                fontSize: '0.6875rem',
                color: 'var(--text-faint)',
                marginLeft: '2px',
              }}
            >
              ({node.children.length})
            </span>
          )}
          {!isEditing && statusLbl && (
            <span
              style={{
                flexShrink: 0,
                fontSize: '0.625rem',
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                color: statusColor,
                marginLeft: '4px',
                lineHeight: 1,
              }}
            >
              {statusLbl}
            </span>
          )}
          {/* Bookmark pin indicator */}
          {!isEditing && isBookmarked && (
            <span
              title="Pinned"
              style={{
                flexShrink: 0,
                fontSize: '0.625rem',
                color: 'var(--accent)',
                marginLeft: '4px',
                lineHeight: 1,
              }}
            >
              ●
            </span>
          )}
          {node.isLoading && (
            <span
              style={{
                fontSize: '0.6875rem',
                color: 'var(--text-faint)',
                flexShrink: 0,
              }}
            >
              ...
            </span>
          )}
        </>
      ) : (
        <>
          {/* Spacer for chevron alignment */}
          <span style={{ width: '16px', flexShrink: 0 }} />
          {/* File type icon */}
          <FileTypeIcon filename={node.name} />
          {isEditing && onEditConfirm && onEditCancel ? (
            <InlineEditInput
              initialValue={editValue ?? node.name}
              onConfirm={onEditConfirm}
              onCancel={onEditCancel}
            />
          ) : (
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '0.8125rem',
                color: statusColor ?? 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <HighlightedName name={node.name} ranges={matchRanges} />
            </span>
          )}
          {!isEditing && statusLbl && (
            <span
              style={{
                flexShrink: 0,
                fontSize: '0.625rem',
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                color: statusColor,
                marginLeft: '4px',
                lineHeight: 1,
              }}
            >
              {statusLbl}
            </span>
          )}
          {/* In search mode, show the directory path */}
          {!isEditing && searchMode && node.relativePath.includes('/') && (
            <span
              style={{
                flexShrink: 0,
                fontSize: '0.6875rem',
                color: 'var(--text-faint)',
                marginLeft: '4px',
                maxWidth: '40%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {node.relativePath.slice(0, node.relativePath.lastIndexOf('/'))}
            </span>
          )}
        </>
      )}
    </div>
  );
}
