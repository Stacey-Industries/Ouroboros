import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Fuse from 'fuse.js';
import { getFileIcon } from '../FileTree/fileIcons';

// ─── Types ──────────────────────────────────────────────────────────────────

interface FileEntry {
  /** File name (basename) */
  name: string;
  /** Absolute path */
  path: string;
  /** Path relative to project root (forward slashes) */
  relativePath: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_RESULTS = 30;
const ITEM_HEIGHT = 36;
const MAX_VISIBLE = 12;

/** Directories to skip during recursive scan */
const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  '__pycache__',
  '.next',
  '.cache',
  'coverage',
  'build',
]);

function shouldIgnore(name: string): boolean {
  return IGNORED_DIRS.has(name);
}

function normPath(p: string): string {
  return p.replace(/\\/g, '/');
}

function relPath(root: string, absPath: string): string {
  const rn = normPath(root);
  const an = normPath(absPath);
  return an.startsWith(rn) ? an.slice(rn.length).replace(/^\//, '') : an;
}

function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? filePath;
}

// ─── Recursive file scanner ─────────────────────────────────────────────────

async function scanFilesRecursive(
  root: string,
  dirPath: string,
  files: FileEntry[],
  maxFiles: number,
): Promise<void> {
  if (files.length >= maxFiles) return;

  const result = await window.electronAPI.files.readDir(dirPath);
  if (!result.success || !result.items) return;

  const dirs: string[] = [];

  for (const item of result.items) {
    if (files.length >= maxFiles) break;

    if (item.isDirectory) {
      if (!shouldIgnore(item.name)) {
        dirs.push(item.path);
      }
    } else {
      files.push({
        name: item.name,
        path: item.path,
        relativePath: relPath(root, item.path),
      });
    }
  }

  // Recurse into subdirectories
  for (const dir of dirs) {
    if (files.length >= maxFiles) break;
    await scanFilesRecursive(root, dir, files, maxFiles);
  }
}

// ─── Fuse.js config ─────────────────────────────────────────────────────────

const FUSE_OPTIONS: Fuse.IFuseOptions<FileEntry> = {
  keys: [
    { name: 'name', weight: 0.6 },
    { name: 'relativePath', weight: 0.4 },
  ],
  threshold: 0.4,
  distance: 200,
  minMatchCharLength: 1,
  includeScore: true,
  includeMatches: true,
};

// ─── Match highlight helper ─────────────────────────────────────────────────

interface HighlightedTextProps {
  text: string;
  indices: ReadonlyArray<readonly [number, number]>;
}

function HighlightedText({ text, indices }: HighlightedTextProps): React.ReactElement {
  if (indices.length === 0) return <>{text}</>;

  const indexSet = new Set<number>();
  for (const [start, end] of indices) {
    for (let i = start; i <= end; i++) {
      indexSet.add(i);
    }
  }

  const parts: React.ReactElement[] = [];
  let i = 0;
  while (i < text.length) {
    if (indexSet.has(i)) {
      let end = i;
      while (end < text.length && indexSet.has(end)) end++;
      parts.push(
        <mark
          key={i}
          style={{
            background: 'transparent',
            color: 'var(--accent)',
            fontWeight: 600,
          }}
        >
          {text.slice(i, end)}
        </mark>,
      );
      i = end;
    } else {
      let end = i;
      while (end < text.length && !indexSet.has(end)) end++;
      parts.push(<span key={i}>{text.slice(i, end)}</span>);
      i = end;
    }
  }

  return <>{parts}</>;
}

// ─── FilePicker ─────────────────────────────────────────────────────────────

export interface FilePickerProps {
  isOpen: boolean;
  onClose: () => void;
  projectRoot: string | null;
  onOpenFile: (filePath: string) => void;
}

export function FilePicker({
  isOpen,
  onClose,
  projectRoot,
  onOpenFile,
}: FilePickerProps): React.ReactElement | null {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allFiles, setAllFiles] = useState<FileEntry[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Scan files when opened ──────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen || !projectRoot) {
      return;
    }

    let cancelled = false;
    setIsScanning(true);

    const files: FileEntry[] = [];
    scanFilesRecursive(projectRoot, projectRoot, files, 10000)
      .then(() => {
        if (!cancelled) {
          setAllFiles(files);
          setIsScanning(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsScanning(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, projectRoot]);

  // ── Reset state on open ─────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // ── Fuse index ──────────────────────────────────────────────────────────

  const fuse = useMemo(() => new Fuse(allFiles, FUSE_OPTIONS), [allFiles]);

  // ── Derive matches ──────────────────────────────────────────────────────

  const matches = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed === '') {
      // Show first N files alphabetically when no query
      return allFiles.slice(0, MAX_RESULTS).map((entry) => ({
        entry,
        nameIndices: [] as ReadonlyArray<readonly [number, number]>,
        pathIndices: [] as ReadonlyArray<readonly [number, number]>,
      }));
    }

    const results = fuse.search(trimmed, { limit: MAX_RESULTS });
    return results.map((r) => {
      const nameMatch = r.matches?.find((m) => m.key === 'name');
      const pathMatch = r.matches?.find((m) => m.key === 'relativePath');
      return {
        entry: r.item,
        nameIndices: (nameMatch?.indices ?? []) as ReadonlyArray<readonly [number, number]>,
        pathIndices: (pathMatch?.indices ?? []) as ReadonlyArray<readonly [number, number]>,
      };
    });
  }, [query, fuse, allFiles]);

  // ── Clamp selection ─────────────────────────────────────────────────────

  useEffect(() => {
    setSelectedIndex((prev) =>
      matches.length === 0 ? 0 : Math.min(prev, matches.length - 1),
    );
  }, [matches.length]);

  // ── Scroll selected item into view ──────────────────────────────────────

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (entry: FileEntry) => {
      onClose();
      onOpenFile(entry.path);
    },
    [onClose, onOpenFile],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            matches.length === 0 ? 0 : (prev + 1) % matches.length,
          );
          break;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            matches.length === 0 ? 0 : (prev - 1 + matches.length) % matches.length,
          );
          break;

        case 'Enter':
          e.preventDefault();
          if (matches[selectedIndex] !== undefined) {
            handleSelect(matches[selectedIndex].entry);
          }
          break;

        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [matches, selectedIndex, handleSelect, onClose],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes fp-overlay-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes fp-card-in {
          from { opacity: 0; transform: scale(0.97) translateY(-4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      <div
        aria-modal="true"
        role="dialog"
        aria-label="File Picker"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: '15vh',
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          animation: 'fp-overlay-in 120ms ease',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: '560px',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            animation: 'fp-card-in 120ms ease',
          }}
        >
          {/* ── Search input ── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '0 14px',
              borderBottom: '1px solid var(--border)',
              height: '46px',
            }}
          >
            <span
              style={{
                fontSize: '14px',
                color: 'var(--text-muted)',
                flexShrink: 0,
                fontFamily: 'var(--font-mono)',
              }}
            >
              #
            </span>
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={isOpen}
              aria-autocomplete="list"
              aria-controls="fp-listbox"
              placeholder="Go to file..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '14px',
                color: 'var(--text)',
                fontFamily: 'var(--font-ui)',
                caretColor: 'var(--accent)',
              }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {isScanning && (
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  flexShrink: 0,
                }}
              >
                scanning...
              </span>
            )}
          </div>

          {/* ── Results list ── */}
          <div
            id="fp-listbox"
            role="listbox"
            aria-label="Files"
            ref={listRef}
            style={{
              maxHeight: `${ITEM_HEIGHT * MAX_VISIBLE}px`,
              overflowY: 'auto',
              padding: '4px 0',
            }}
          >
            {matches.length === 0 ? (
              <div
                style={{
                  padding: '16px 14px',
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                }}
              >
                {!projectRoot
                  ? 'No project open'
                  : isScanning
                    ? 'Scanning project files...'
                    : query.trim()
                      ? 'No files matched'
                      : 'No files found'}
              </div>
            ) : (
              matches.map((match, idx) => {
                const { entry, nameIndices, pathIndices } = match;
                const icon = getFileIcon(entry.name);
                const isSelected = idx === selectedIndex;

                // Compute the directory part of relativePath (without the filename)
                const dirPart = entry.relativePath.includes('/')
                  ? entry.relativePath.slice(0, entry.relativePath.lastIndexOf('/'))
                  : '';

                return (
                  <div
                    key={entry.path}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(entry)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 12px',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      margin: '0 4px',
                      height: `${ITEM_HEIGHT}px`,
                      boxSizing: 'border-box',
                      backgroundColor: isSelected ? 'var(--accent)' : 'transparent',
                      color: isSelected ? 'var(--bg)' : 'var(--text)',
                      transition: 'background-color 80ms ease',
                      userSelect: 'none',
                      minWidth: 0,
                    }}
                  >
                    {/* Color dot icon */}
                    <span
                      style={{
                        flexShrink: 0,
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: icon.color,
                        opacity: isSelected ? 0.85 : 1,
                      }}
                    />

                    {/* Filename with match highlight */}
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: '13px',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <HighlightedText
                        text={entry.name}
                        indices={isSelected ? [] : nameIndices}
                      />
                    </span>

                    {/* Relative directory path (dimmed) */}
                    {dirPart && (
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: '12px',
                          color: isSelected
                            ? 'rgba(255,255,255,0.6)'
                            : 'var(--text-faint)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        <HighlightedText
                          text={dirPart}
                          indices={isSelected ? [] : pathIndices}
                        />
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* ── Footer hint ── */}
          <div
            style={{
              display: 'flex',
              gap: '14px',
              padding: '6px 14px',
              borderTop: '1px solid var(--border)',
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span>↑↓ navigate</span>
            <span>↵ open</span>
            <span>esc close</span>
            {allFiles.length > 0 && (
              <span style={{ marginLeft: 'auto' }}>{allFiles.length} files</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
