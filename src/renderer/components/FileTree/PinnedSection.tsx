/**
 * PinnedSection — renders the bookmarked/pinned files section at the top
 * of the file tree. Shows a collapsible list of pinned items with unpin buttons.
 *
 * Extracted from FileTree.tsx.
 */

import React, { useState, useEffect } from 'react';
import { FileTypeIcon, FolderTypeIcon } from './FileTypeIcon';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PinnedItemInfo {
  path: string;
  name: string;
  isDirectory: boolean;
}

export interface PinnedSectionProps {
  bookmarks: string[];
  activeFilePath: string | null;
  onFileSelect: (filePath: string) => void;
  onUnpin: (path: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PinnedSection({
  bookmarks,
  activeFilePath,
  onFileSelect,
  onUnpin,
}: PinnedSectionProps): React.ReactElement | null {
  const [isExpanded, setIsExpanded] = useState(true);
  const [pinnedItems, setPinnedItems] = useState<PinnedItemInfo[]>([]);

  // Resolve bookmark paths to get name and isDirectory info
  useEffect(() => {
    if (bookmarks.length === 0) {
      setPinnedItems([]);
      return;
    }

    let cancelled = false;

    async function resolve() {
      const items: PinnedItemInfo[] = [];
      for (const bPath of bookmarks) {
        const name = bPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? bPath;
        // Try to determine if it's a directory by reading its parent
        // We'll use a simple stat-like approach: try readDir on it
        const result = await window.electronAPI.files.readDir(bPath);
        const isDir = result.success === true;
        items.push({ path: bPath, name, isDirectory: isDir });
      }
      if (!cancelled) setPinnedItems(items);
    }

    void resolve();
    return () => { cancelled = true; };
  }, [bookmarks]);

  if (bookmarks.length === 0) return null;

  return (
    <div style={{ borderBottom: '1px solid var(--border-muted)' }}>
      <style>{`.pinned-item-row:hover .pinned-unpin-btn { opacity: 1 !important; }`}</style>
      {/* Pinned header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          gap: '4px',
          cursor: 'pointer',
          userSelect: 'none',
          backgroundColor: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border-muted)',
          minHeight: '26px',
        }}
        onClick={() => setIsExpanded((prev) => !prev)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsExpanded((prev) => !prev); }}
        aria-expanded={isExpanded}
        aria-label="Toggle Pinned section"
      >
        {/* Collapse chevron */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
          style={{
            flexShrink: 0,
            color: 'var(--text-faint)',
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 150ms',
          }}
        >
          <path d="M3 2L7 5L3 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Pin icon */}
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          style={{ flexShrink: 0, color: 'var(--accent)' }}
        >
          <path
            d="M9.828 2.172a2 2 0 0 1 2.828 0l1.172 1.172a2 2 0 0 1 0 2.828L11 9l.5 5-3-3-4 4v-1.5L1 11l3-3-3-3 5 .5z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <span
          style={{
            flex: 1,
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          Pinned
        </span>

        {/* Count badge */}
        <span
          style={{
            flexShrink: 0,
            fontSize: '0.625rem',
            fontWeight: 600,
            color: 'var(--text-faint)',
            backgroundColor: 'var(--bg)',
            padding: '0 5px',
            borderRadius: '8px',
            lineHeight: '16px',
          }}
        >
          {bookmarks.length}
        </span>
      </div>

      {/* Pinned items list */}
      {isExpanded && (
        <div role="list" aria-label="Pinned items">
          {pinnedItems.map((item) => (
            <div
              key={item.path}
              role="listitem"
              className="pinned-item-row"
              onClick={() => onFileSelect(item.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                paddingLeft: '20px',
                paddingRight: '8px',
                cursor: 'pointer',
                height: '28px',
                boxSizing: 'border-box',
                backgroundColor: item.path === activeFilePath
                  ? 'rgba(var(--accent-rgb, 88, 166, 255), 0.1)'
                  : 'transparent',
                borderLeft: item.path === activeFilePath
                  ? '2px solid var(--accent)'
                  : '2px solid transparent',
                userSelect: 'none',
              }}
              onMouseEnter={(e) => {
                if (item.path !== activeFilePath) {
                  (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--bg-tertiary)';
                }
              }}
              onMouseLeave={(e) => {
                if (item.path !== activeFilePath) {
                  (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
                }
              }}
              title={item.path}
            >
              {/* File/folder icon */}
              {item.isDirectory ? (
                <FolderTypeIcon name={item.name} open={false} />
              ) : (
                <FileTypeIcon filename={item.name} />
              )}

              {/* Name */}
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: '0.8125rem',
                  color: item.isDirectory ? 'var(--text)' : 'var(--text-secondary)',
                  fontFamily: item.isDirectory ? 'var(--font-ui)' : 'var(--font-mono)',
                  fontWeight: item.isDirectory ? 500 : undefined,
                }}
              >
                {item.name}
              </span>

              {/* Accent dot */}
              <span
                style={{
                  flexShrink: 0,
                  fontSize: '0.625rem',
                  color: 'var(--accent)',
                  lineHeight: 1,
                }}
              >
                ●
              </span>

              {/* Unpin button */}
              <button
                className="pinned-unpin-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnpin(item.path);
                }}
                title={`Unpin "${item.name}"`}
                style={{
                  flexShrink: 0,
                  background: 'none',
                  border: 'none',
                  padding: '2px',
                  cursor: 'pointer',
                  color: 'var(--text-faint)',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '3px',
                  opacity: 0,
                  transition: 'opacity 150ms',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)';
                }}
                aria-label={`Unpin ${item.name}`}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
