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

const FILE_ICON_MAP: Record<string, string> = {
  '.ts': 'T', '.tsx': 'T', '.js': 'J', '.jsx': 'J',
  '.py': 'P', '.rs': 'R', '.go': 'G',
  '.css': '#', '.scss': '#', '.html': 'H',
  '.json': '{}', '.md': 'M',
};

function getFileIconChar(filename: string): string {
  const dotIdx = filename.lastIndexOf('.');
  const ext = dotIdx >= 0 ? filename.slice(dotIdx).toLowerCase() : '';
  return FILE_ICON_MAP[ext] ?? '\u25A1';
}

interface BookmarkItemProps {
  filePath: string;
  onClick: (filePath: string) => void;
  onRemove: (filePath: string) => void;
}

const BOOKMARK_ITEM_STYLE: React.CSSProperties = {
  padding: '2px 8px', fontSize: '0.6875rem',
  fontFamily: 'var(--font-mono)', lineHeight: '1.5',
};
const BOOKMARK_ICON_STYLE: React.CSSProperties = {
  flexShrink: 0, width: '12px', textAlign: 'center',
  fontSize: '0.6rem', fontFamily: 'var(--font-mono)',
};
const BOOKMARK_LABEL_STYLE: React.CSSProperties = {
  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
  whiteSpace: 'nowrap', minWidth: 0,
};
const BOOKMARK_UNPIN_STYLE: React.CSSProperties = {
  opacity: 0, flexShrink: 0, padding: '0 2px', background: 'none',
  fontSize: '0.6875rem', lineHeight: 1, transition: 'opacity 100ms',
};

function useBookmarkItemHover() {
  const handlePointerEnter = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.style.backgroundColor = 'var(--surface-raised)';
    const btn = e.currentTarget.querySelector<HTMLElement>('[data-unpin]');
    if (btn) btn.style.opacity = '1';
  }, []);
  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.style.backgroundColor = 'transparent';
    const btn = e.currentTarget.querySelector<HTMLElement>('[data-unpin]');
    if (btn) btn.style.opacity = '0';
  }, []);
  return { handlePointerEnter, handlePointerLeave };
}

function BookmarkItem({ filePath, onClick, onRemove }: BookmarkItemProps): React.ReactElement {
  const filename = getFilename(filePath);
  const { handlePointerEnter, handlePointerLeave } = useBookmarkItemHover();

  return (
    <div
      className="flex items-center gap-1.5 cursor-pointer select-none text-text-semantic-muted"
      style={BOOKMARK_ITEM_STYLE}
      onClick={() => onClick(filePath)}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      title={filePath}
    >
      <span className="text-text-semantic-faint" style={BOOKMARK_ICON_STYLE}>
        {getFileIconChar(filename)}
      </span>
      <span style={BOOKMARK_LABEL_STYLE}>{filename}</span>
      <button
        data-unpin
        className="border-none cursor-pointer outline-none text-text-semantic-faint"
        style={BOOKMARK_UNPIN_STYLE}
        onClick={(e) => { e.stopPropagation(); onRemove(filePath); }}
        title="Remove bookmark"
      >
        {'\u00D7'}
      </button>
    </div>
  );
}

const BOOKMARKS_EMPTY_STYLE: React.CSSProperties = {
  fontSize: '0.6875rem', fontFamily: 'var(--font-ui)',
  padding: '16px 12px', textAlign: 'center', lineHeight: '1.6',
};

function useBookmarksState() {
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const { openFile } = useFileViewerManager();
  useEffect(() => {
    if (!hasElectronAPI()) return;
    void window.electronAPI.config.get('bookmarks').then((bm) => { setBookmarks(bm ?? []); });
  }, []);
  const handleOpen = useCallback((filePath: string) => { void openFile(filePath); }, [openFile]);
  const handleRemove = useCallback((filePath: string) => {
    setBookmarks((prev) => {
      const next = prev.filter((p) => p !== filePath);
      if (hasElectronAPI()) { void window.electronAPI.config.set('bookmarks', next); }
      return next;
    });
  }, []);
  return { bookmarks, handleOpen, handleRemove };
}

export function BookmarksSection(): React.ReactElement {
  const { bookmarks, handleOpen, handleRemove } = useBookmarksState();
  if (bookmarks.length === 0) {
    return (
      <div className="flex items-center justify-center text-text-semantic-muted" style={BOOKMARKS_EMPTY_STYLE}>
        No bookmarks. Right-click files in the tree to bookmark them.
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      {bookmarks.map((filePath) => (
        <BookmarkItem key={filePath} filePath={filePath} onClick={handleOpen} onRemove={handleRemove} />
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
