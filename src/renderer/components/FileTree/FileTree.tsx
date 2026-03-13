/**
 * FileTree — multi-root hierarchical file tree with pinned section and search.
 *
 * Sub-components (RootSection, PinnedSection, SearchOverlay) and utility
 * functions (fileTreeUtils) are in separate files to keep this module focused
 * on orchestration.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { EmptyState } from '../shared';
import { useToastContext } from '../../contexts/ToastContext';
import { RootSection } from './RootSection';
import { PinnedSection } from './PinnedSection';
import { SearchOverlay } from './SearchOverlay';

// ─── Public props ─────────────────────────────────────────────────────────────

export interface FileTreeProps {
  /** All open project roots */
  projectRoots: string[];
  activeFilePath: string | null;
  onFileSelect: (filePath: string) => void;
  /** Called when the user removes a root from the workspace */
  onRemoveRoot?: (root: string) => void;
  // Backwards-compatible single-root prop (ignored when projectRoots is non-empty)
  projectRoot?: string | null;
}

// ─── FileTree ─────────────────────────────────────────────────────────────────

/**
 * FileTree — multi-root hierarchical tree view.
 *
 * Each root is rendered as a collapsible RootSection with its own independent
 * tree state, git status polling, search, and file operations.
 *
 * When only one root is open, the header is still shown for consistency but the
 * remove button is hidden (you can't remove the last root this way — use the
 * project picker instead).
 */
export const FileTree = React.memo(function FileTree({
  projectRoots,
  activeFilePath,
  onFileSelect,
  onRemoveRoot,
  projectRoot: singleRootProp,
}: FileTreeProps): React.ReactElement {
  // Normalise: if projectRoots is empty but the legacy single-root prop is set,
  // use it. This keeps backwards compatibility when callers haven't been updated.
  const roots = useMemo(() => {
    if (projectRoots.length > 0) return projectRoots;
    if (singleRootProp) return [singleRootProp];
    return [];
  }, [projectRoots, singleRootProp]);

  // Track which roots are expanded (all expanded by default)
  const [expandedRoots, setExpandedRoots] = useState<Set<string>>(new Set(roots));

  // When a new root is added, auto-expand it
  useEffect(() => {
    setExpandedRoots((prev) => {
      const next = new Set(prev);
      for (const r of roots) {
        if (!next.has(r)) next.add(r);
      }
      return next;
    });
  }, [roots]);

  const toggleRoot = useCallback((root: string) => {
    setExpandedRoots((prev) => {
      const next = new Set(prev);
      if (next.has(root)) {
        next.delete(root);
      } else {
        next.add(root);
      }
      return next;
    });
  }, []);

  // Shared config state (bookmarks + ignore patterns) loaded once here
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [extraIgnorePatterns, setExtraIgnorePatterns] = useState<string[]>([]);

  useEffect(() => {
    void window.electronAPI.config.get('bookmarks').then((val) => {
      setBookmarks((val as string[]) ?? []);
    });
    void window.electronAPI.config.get('fileTreeIgnorePatterns').then((val) => {
      setExtraIgnorePatterns((val as string[]) ?? []);
    });

    const cleanup = window.electronAPI.config.onExternalChange((cfg) => {
      setBookmarks(cfg.bookmarks ?? []);
      setExtraIgnorePatterns(cfg.fileTreeIgnorePatterns ?? []);
    });
    return cleanup;
  }, []);

  const { toast } = useToastContext();

  // Handler to unpin a bookmark from the Pinned section
  const handleUnpin = useCallback(
    async (path: string) => {
      const updated = bookmarks.filter((p) => p !== path);
      const result = await window.electronAPI.config.set('bookmarks', updated);
      if (result.success) {
        setBookmarks(updated);
        const name = path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path;
        toast(`Removed "${name}" from Pinned`, 'success');
      } else {
        toast(`Unpin failed: ${result.error}`, 'error');
      }
    },
    [bookmarks, toast]
  );

  // Shared cross-root search state
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  if (roots.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <EmptyState
          icon="folder"
          title="Open a folder to get started"
          description="Use the project picker above or open a folder from the File menu."
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Global search input */}
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
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files…"
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
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
      </div>

      {/* Root sections */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        {/* Pinned section — shown above tree when bookmarks exist */}
        <PinnedSection
          bookmarks={bookmarks}
          activeFilePath={activeFilePath}
          onFileSelect={onFileSelect}
          onUnpin={(path) => void handleUnpin(path)}
        />

        {roots.map((root) => (
          <RootSection
            key={root}
            root={root}
            isExpanded={expandedRoots.has(root)}
            onToggle={() => toggleRoot(root)}
            activeFilePath={activeFilePath}
            onFileSelect={onFileSelect}
            onRemove={roots.length > 1 && onRemoveRoot ? () => onRemoveRoot(root) : undefined}
            bookmarks={bookmarks}
            extraIgnorePatterns={extraIgnorePatterns}
          />
        ))}

        {/* Cross-root search results */}
        {query.trim().length > 0 && (
          <SearchOverlay
            roots={roots}
            query={query}
            activeFilePath={activeFilePath}
            onFileSelect={(path) => {
              onFileSelect(path);
              setQuery('');
            }}
          />
        )}
      </div>
    </div>
  );
})
