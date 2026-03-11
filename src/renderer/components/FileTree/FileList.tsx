import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import Fuse from 'fuse.js';
import type { FileEntry, MatchRange } from './FileListItem';
import { FileListItem } from './FileListItem';

export interface FileListProps {
  projectRoot: string | null;
  activeFilePath: string | null;
  onFileSelect: (filePath: string) => void;
}

const ITEM_HEIGHT = 32; // px — must match FileListItem minHeight
const OVERSCAN = 5;

/** Recursively collects all files from a directory via readDir. */
async function collectFiles(
  root: string,
  dirPath: string,
  results: FileEntry[]
): Promise<void> {
  const result = await window.electronAPI.files.readDir(dirPath);
  if (!result.success || !result.items) return;

  const rootNorm = root.replace(/\\/g, '/');

  for (const item of result.items) {
    if (item.isDirectory) {
      // Skip hidden dirs and common noise dirs
      const name = item.name;
      if (
        name.startsWith('.') ||
        name === 'node_modules' ||
        name === 'dist' ||
        name === 'out' ||
        name === '__pycache__' ||
        name === '.git'
      ) {
        continue;
      }
      await collectFiles(root, item.path, results);
    } else if (item.isFile) {
      const absPath = item.path.replace(/\\/g, '/');
      const relativePath = absPath.startsWith(rootNorm)
        ? absPath.slice(rootNorm.length).replace(/^\//, '')
        : absPath;

      const lastSlash = relativePath.lastIndexOf('/');
      const name = lastSlash === -1 ? relativePath : relativePath.slice(lastSlash + 1);
      const dir = lastSlash === -1 ? '' : relativePath.slice(0, lastSlash);

      results.push({
        path: item.path,
        relativePath,
        name,
        dir,
        size: 0, // size not provided by readDir — display as 0
      });
    }
  }
}

/**
 * FileList — flat searchable/filterable list of all files in the project.
 * Uses Fuse.js for fuzzy filtering and a simple virtualised render for perf.
 */
export function FileList({
  projectRoot,
  activeFilePath,
  onFileSelect,
}: FileListProps): React.ReactElement {
  const [allFiles, setAllFiles] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [focusIndex, setFocusIndex] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerHeight = useRef(400); // updated on render

  // Load files when project root changes
  useEffect(() => {
    if (!projectRoot) {
      setAllFiles([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setQuery('');
    setFocusIndex(0);

    const results: FileEntry[] = [];
    collectFiles(projectRoot, projectRoot, results)
      .then(() => {
        if (!cancelled) {
          // Sort: files in root first, then alphabetical by relative path
          results.sort((a, b) => {
            const aDepth = a.relativePath.split('/').length;
            const bDepth = b.relativePath.split('/').length;
            if (aDepth !== bDepth) return aDepth - bDepth;
            return a.relativePath.localeCompare(b.relativePath);
          });
          setAllFiles(results);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectRoot]);

  // Fuse instance (recreated when allFiles changes)
  const fuse = useMemo(
    () =>
      new Fuse(allFiles, {
        keys: ['relativePath', 'name'],
        threshold: 0.4,
        includeMatches: true,
        minMatchCharLength: 1,
      }),
    [allFiles]
  );

  // Filtered results with match ranges
  const filteredItems = useMemo((): Array<{ file: FileEntry; ranges?: MatchRange[] }> => {
    if (!query.trim()) {
      return allFiles.map((f) => ({ file: f }));
    }
    return fuse.search(query).map((result) => {
      const ranges: MatchRange[] = [];
      if (result.matches) {
        for (const match of result.matches) {
          if (match.key === 'name' && match.indices) {
            for (const [start, end] of match.indices) {
              ranges.push({ start, end: end + 1 });
            }
          }
        }
      }
      return { file: result.item, ranges };
    });
  }, [query, fuse, allFiles]);

  // Clamp focus index when list changes
  useEffect(() => {
    setFocusIndex((prev) => Math.min(prev, Math.max(0, filteredItems.length - 1)));
  }, [filteredItems.length]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex((prev) => Math.min(prev + 1, filteredItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filteredItems[focusIndex];
        if (item) onFileSelect(item.file.path);
      } else if (e.key === 'Escape') {
        setQuery('');
        setFocusIndex(0);
      }
    },
    [filteredItems, focusIndex, onFileSelect]
  );

  // Scroll focused item into view (in virtualised list)
  useEffect(() => {
    const itemTop = focusIndex * ITEM_HEIGHT;
    const itemBottom = itemTop + ITEM_HEIGHT;
    const visibleTop = scrollTop;
    const visibleBottom = scrollTop + containerHeight.current;

    if (itemTop < visibleTop) {
      listRef.current?.scrollTo({ top: itemTop });
    } else if (itemBottom > visibleBottom) {
      listRef.current?.scrollTo({ top: itemBottom - containerHeight.current });
    }
  }, [focusIndex, scrollTop]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
    containerHeight.current = e.currentTarget.clientHeight;
  }, []);

  // Virtualised window
  const totalHeight = filteredItems.length * ITEM_HEIGHT;
  const visibleStart = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const visibleCount =
    Math.ceil(containerHeight.current / ITEM_HEIGHT) + OVERSCAN * 2;
  const visibleEnd = Math.min(filteredItems.length, visibleStart + visibleCount);
  const visibleItems = filteredItems.slice(visibleStart, visibleEnd);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      onKeyDown={handleKeyDown}
    >
      {/* Search input */}
      <div
        style={{
          padding: '6px 8px',
          flexShrink: 0,
          borderBottom: '1px solid var(--border-muted)',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setFocusIndex(0);
          }}
          placeholder={projectRoot ? 'Search files…' : 'Open a folder to start'}
          disabled={!projectRoot || isLoading}
          aria-label="Filter files"
          className="selectable"
          style={{
            width: '100%',
            padding: '4px 8px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: 'var(--text)',
            fontSize: '0.8125rem',
            fontFamily: 'var(--font-ui)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={(e) =>
            (e.currentTarget.style.borderColor = 'var(--accent)')
          }
          onBlur={(e) =>
            (e.currentTarget.style.borderColor = 'var(--border)')
          }
        />
      </div>

      {/* Status bar */}
      {!isLoading && !error && projectRoot && (
        <div
          style={{
            padding: '2px 12px',
            fontSize: '0.6875rem',
            color: 'var(--text-faint)',
            flexShrink: 0,
          }}
        >
          {query
            ? `${filteredItems.length} of ${allFiles.length} files`
            : `${allFiles.length} files`}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div
          style={{
            padding: '16px 12px',
            color: 'var(--text-muted)',
            fontSize: '0.8125rem',
          }}
        >
          Loading files…
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '12px',
            color: 'var(--error)',
            fontSize: '0.8125rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Empty state: no project */}
      {!projectRoot && !isLoading && (
        <div
          style={{
            padding: '24px 12px',
            color: 'var(--text-faint)',
            fontSize: '0.8125rem',
            textAlign: 'center',
          }}
        >
          No folder open.
          <br />
          Use the picker above to open a project.
        </div>
      )}

      {/* Virtualised file list */}
      {!isLoading && !error && filteredItems.length > 0 && (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Files"
          onScroll={handleScroll}
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            position: 'relative',
          }}
        >
          {/* Total height spacer */}
          <div style={{ height: totalHeight, position: 'relative' }}>
            {/* Render only visible slice */}
            <div
              style={{
                position: 'absolute',
                top: visibleStart * ITEM_HEIGHT,
                left: 0,
                right: 0,
              }}
            >
              {visibleItems.map(({ file, ranges }, i) => {
                const absoluteIndex = visibleStart + i;
                return (
                  <FileListItem
                    key={file.path}
                    file={file}
                    isActive={file.path === activeFilePath}
                    isFocused={absoluteIndex === focusIndex}
                    matchRanges={ranges}
                    onClick={(f) => onFileSelect(f.path)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Empty search results */}
      {!isLoading && !error && projectRoot && query && filteredItems.length === 0 && (
        <div
          style={{
            padding: '16px 12px',
            color: 'var(--text-faint)',
            fontSize: '0.8125rem',
            textAlign: 'center',
          }}
        >
          No files match "{query}"
        </div>
      )}
    </div>
  );
}
