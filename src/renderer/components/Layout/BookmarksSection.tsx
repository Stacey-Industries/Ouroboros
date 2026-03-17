/**
 * BookmarksSection — Shows bookmarked/pinned files from config.
 *
 * Displays a list of bookmarked file paths. Click opens the file,
 * hover reveals an unpin button.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useFileViewerManager } from '../FileViewer';

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

function getFilename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function getFileIconChar(filename: string): string {
  const ext = filename.lastIndexOf('.') >= 0
    ? filename.slice(filename.lastIndexOf('.')).toLowerCase()
    : '';
  switch (ext) {
    case '.ts': case '.tsx': return 'T';
    case '.js': case '.jsx': return 'J';
    case '.py': return 'P';
    case '.rs': return 'R';
    case '.go': return 'G';
    case '.css': case '.scss': return '#';
    case '.html': return 'H';
    case '.json': return '{}';
    case '.md': return 'M';
    default: return '\u25A1'; // small square
  }
}

interface BookmarkItemProps {
  filePath: string;
  onClick: (filePath: string) => void;
  onRemove: (filePath: string) => void;
}

function BookmarkItem({ filePath, onClick, onRemove }: BookmarkItemProps): React.ReactElement {
  const filename = getFilename(filePath);

  const handlePointerEnter = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
    const btn = e.currentTarget.querySelector<HTMLElement>('[data-unpin]');
    if (btn) btn.style.opacity = '1';
  }, []);

  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.style.backgroundColor = 'transparent';
    const btn = e.currentTarget.querySelector<HTMLElement>('[data-unpin]');
    if (btn) btn.style.opacity = '0';
  }, []);

  return (
    <div
      className="flex items-center gap-1.5 cursor-pointer select-none"
      style={{
        padding: '2px 8px',
        fontSize: '0.6875rem',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-muted)',
        lineHeight: '1.5',
      }}
      onClick={() => onClick(filePath)}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      title={filePath}
    >
      <span
        style={{
          flexShrink: 0,
          width: '12px',
          textAlign: 'center',
          fontSize: '0.6rem',
          color: 'var(--text-faint)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {getFileIconChar(filename)}
      </span>
      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {filename}
      </span>
      <button
        data-unpin
        className="border-none cursor-pointer outline-none"
        style={{
          opacity: 0,
          flexShrink: 0,
          padding: '0 2px',
          background: 'none',
          color: 'var(--text-faint)',
          fontSize: '0.6875rem',
          lineHeight: 1,
          transition: 'opacity 100ms',
        }}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(filePath);
        }}
        title="Remove bookmark"
      >
        \u00D7
      </button>
    </div>
  );
}

export function BookmarksSection(): React.ReactElement {
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const { openFile } = useFileViewerManager();

  useEffect(() => {
    if (!hasElectronAPI()) return;
    void window.electronAPI.config.get('bookmarks').then((bm) => {
      setBookmarks(bm ?? []);
    });
  }, []);

  const handleOpen = useCallback(
    (filePath: string) => {
      void openFile(filePath);
    },
    [openFile],
  );

  const handleRemove = useCallback((filePath: string) => {
    setBookmarks((prev) => {
      const next = prev.filter((p) => p !== filePath);
      if (hasElectronAPI()) {
        void window.electronAPI.config.set('bookmarks', next);
      }
      return next;
    });
  }, []);

  if (bookmarks.length === 0) {
    return (
      <div
        className="flex items-center justify-center"
        style={{
          color: 'var(--text-muted)',
          fontSize: '0.6875rem',
          fontFamily: 'var(--font-ui)',
          padding: '16px 12px',
          textAlign: 'center',
          lineHeight: '1.6',
        }}
      >
        No bookmarks. Right-click files in the tree to bookmark them.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {bookmarks.map((filePath) => (
        <BookmarkItem
          key={filePath}
          filePath={filePath}
          onClick={handleOpen}
          onRemove={handleRemove}
        />
      ))}
    </div>
  );
}

/** Returns the current bookmark count (for the section badge). */
export function useBookmarkCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!hasElectronAPI()) return;
    void window.electronAPI.config.get('bookmarks').then((bm) => {
      setCount(bm?.length ?? 0);
    });
  }, []);

  return count;
}
