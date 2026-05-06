/**
 * FileTree - multi-root hierarchical tree view.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import { REFRESH_FILE_TREE_EVENT } from '../../hooks/appEventNames';
import { useFileHeatMap } from '../../hooks/useFileHeatMap';
import { useGitStatusDetailed } from '../../hooks/useGitStatusDetailed';
import { EmptyStateMessage } from '../EmptyState';
import { FileTreeBody } from './FileTreeBody';
import { FileTreeSearchBar } from './FileTreeSearchBar';
import { useFileTreeStore } from './fileTreeStore';
import { GitBranchIndicator } from './GitBranchIndicator';
import { computeStatusCounts, GitStatusFilterBar } from './GitStatusFilter';

export interface FileTreeProps {
  projectRoots: string[];
  activeFilePath: string | null;
  /** Called on single-click (opens preview tab) */
  onFileSelect: (filePath: string) => void;
  /** Called on double-click (opens permanent tab). Falls back to onFileSelect if not provided. */
  onFileOpen?: (filePath: string) => void;
  onRemoveRoot?: (root: string) => void;
  projectRoot?: string | null;
}

type ToastFn = ReturnType<typeof useToastContext>['toast'];

const treeContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
};

function resolveRoots(projectRoots: string[], singleRootProp?: string | null): string[] {
  if (projectRoots.length > 0) return projectRoots;
  if (singleRootProp) return [singleRootProp];
  return [];
}

function useResolvedRoots(projectRoots: string[], singleRootProp?: string | null): string[] {
  return useMemo(() => resolveRoots(projectRoots, singleRootProp), [projectRoots, singleRootProp]);
}

/**
 * useExpandedRoots — backed by the Zustand fileTreeStore.
 *
 * expandedPaths in the store tracks ALL expanded paths (roots + subdirectories).
 * This hook ensures newly-added roots are auto-expanded, then delegates
 * toggle/read to the store.
 *
 * Cold-boot fix: the previous version persisted the expand via `useEffect`,
 * which runs AFTER the first render. RootSection has `enabled = isExpanded`
 * — when `isExpanded` is `false` on first paint (root not yet in
 * expandedPaths), `useRootLoader`/`useRootFileWatcher` short-circuit and the
 * tree stays empty until a re-render. To fix that, we compute an
 * `effectiveExpanded` set synchronously that includes any root we're about
 * to auto-expand, while a useEffect persists the change to the store. Roots
 * we've already auto-expanded once are tracked in a ref so user-collapse is
 * respected on subsequent renders.
 */
function useExpandedRoots(roots: string[]): {
  expandedRoots: Set<string>;
  toggleRoot: (root: string) => void;
} {
  const expandedPaths = useFileTreeStore((s) => s.expandedPaths);
  const ensureExpanded = useFileTreeStore((s) => s.ensureExpanded);
  const toggleExpand = useFileTreeStore((s) => s.toggleExpand);
  const seenRootsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const root of roots) {
      if (seenRootsRef.current.has(root)) continue;
      seenRootsRef.current.add(root);
      ensureExpanded(root);
    }
  }, [roots, ensureExpanded]);

  const effectiveExpanded = useMemo(() => {
    const pendingExpand = roots.filter(
      (r) => !seenRootsRef.current.has(r) && !expandedPaths.has(r),
    );
    if (pendingExpand.length === 0) return expandedPaths;
    const merged = new Set(expandedPaths);
    for (const r of pendingExpand) merged.add(r);
    return merged;
  }, [roots, expandedPaths]);

  return { expandedRoots: effectiveExpanded, toggleRoot: toggleExpand };
}

function useFileTreeConfig(): {
  bookmarks: string[];
  setBookmarks: React.Dispatch<React.SetStateAction<string[]>>;
  extraIgnorePatterns: string[];
} {
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [extraIgnorePatterns, setExtraIgnorePatterns] = useState<string[]>([]);

  useEffect(() => {
    void window.electronAPI.config
      .get('bookmarks')
      .then((value) => setBookmarks((value as string[]) ?? []));
    void window.electronAPI.config
      .get('fileTreeIgnorePatterns')
      .then((value) => setExtraIgnorePatterns((value as string[]) ?? []));
    return window.electronAPI.config.onExternalChange((config) => {
      setBookmarks(config.bookmarks ?? []);
      setExtraIgnorePatterns(config.fileTreeIgnorePatterns ?? []);
    });
  }, []);

  return { bookmarks, setBookmarks, extraIgnorePatterns };
}

function pinnedName(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path;
}

function useUnpinHandler(
  bookmarks: string[],
  setBookmarks: React.Dispatch<React.SetStateAction<string[]>>,
  toast: ToastFn,
): (path: string) => Promise<void> {
  return useCallback(
    async (path: string) => {
      const updated = bookmarks.filter((bookmark) => bookmark !== path);
      const result = await window.electronAPI.config.set('bookmarks', updated);
      if (!result.success) {
        toast(`Unpin failed: ${result.error}`, 'error');
        return;
      }
      setBookmarks(updated);
      toast(`Removed "${pinnedName(path)}" from Pinned`, 'success');
    },
    [bookmarks, setBookmarks, toast],
  );
}

/**
 * useSearchQuery — backed by the Zustand fileTreeStore.
 *
 * The search query now lives in the central store so other components
 * (e.g. SearchOverlay, command palette) can read/write it without prop drilling.
 * The setQuery wrapper is typed to match React.Dispatch<SetStateAction<string>>
 * for backward compatibility with FileTreeSearchBar.
 */
function useSearchQuery(onFileSelect: (filePath: string) => void): {
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  handleSearchSelect: (path: string) => void;
} {
  const query = useFileTreeStore((s) => s.searchQuery);
  const storeSetQuery = useFileTreeStore((s) => s.setSearchQuery);

  // Wrap the store setter to match React.Dispatch<SetStateAction<string>> signature
  const setQuery: React.Dispatch<React.SetStateAction<string>> = useCallback(
    (action: React.SetStateAction<string>) => {
      if (typeof action === 'function') {
        // Read current value from store for functional updates
        const current = useFileTreeStore.getState().searchQuery;
        storeSetQuery(action(current));
      } else {
        storeSetQuery(action);
      }
    },
    [storeSetQuery],
  );

  const handleSearchSelect = useCallback(
    (path: string) => {
      onFileSelect(path);
      storeSetQuery('');
    },
    [onFileSelect, storeSetQuery],
  );

  return { query, setQuery, handleSearchSelect };
}

function useRefreshFilesEvent(): void {
  const clearLoadedDirs = useFileTreeStore((s) => s.clearLoadedDirs);
  useEffect(() => {
    const handler = (): void => clearLoadedDirs();
    window.addEventListener(REFRESH_FILE_TREE_EVENT, handler);
    return () => window.removeEventListener(REFRESH_FILE_TREE_EVENT, handler);
  }, [clearLoadedDirs]);
}

const FOLDER_ICON = (
  <svg
    width="48"
    height="48"
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M8 14C8 12.3431 9.34315 11 11 11H19L23 15H37C38.6569 15 40 16.3431 40 18V34C40 35.6569 38.6569 37 37 37H11C9.34315 37 8 35.6569 8 34V14Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path d="M8 20H40" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

function openFolderDialog(): void {
  void window.electronAPI.files.selectFolder().then((result) => {
    if (!result.cancelled && result.path) {
      void window.electronAPI.config.set('defaultProjectRoot', result.path);
    }
  });
}

function EmptyFileTree(): React.ReactElement {
  return (
    <div style={treeContainerStyle}>
      {/* Wave 38 Phase C — i18n empty-state with persistent dismiss + open-folder action */}
      <EmptyStateMessage
        messageKey="emptyState.fileTree.primary"
        icon={FOLDER_ICON}
        dismissKey="fileTree"
        actionLabel="emptyState.fileTree.action"
        onAction={openFolderDialog}
      />
    </div>
  );
}

interface FileTreeContentProps {
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  heatMapEnabled: boolean;
  heatMapCount: number;
  onToggleHeatMap: () => void;
  bodyProps: Omit<
    React.ComponentProps<typeof FileTreeBody>,
    'query' | 'projectRoot' | 'gitDetailedStatus' | 'gitIsRepo' | 'gitRefresh' | 'gitFilter'
  >;
  /** Primary project root for git operations */
  primaryRoot: string;
}

function FileTreeContent({
  query,
  setQuery,
  inputRef,
  heatMapEnabled,
  heatMapCount,
  onToggleHeatMap,
  bodyProps,
  primaryRoot,
}: FileTreeContentProps): React.ReactElement {
  const { status, isRepo, refresh } = useGitStatusDetailed(primaryRoot);
  const counts = useMemo(() => computeStatusCounts(status), [status]);
  const filter = useFileTreeStore((s) => s.filter);

  return (
    <div style={treeContainerStyle}>
      <GitBranchIndicator projectRoot={primaryRoot} isRepo={isRepo} />
      <FileTreeSearchBar
        query={query}
        setQuery={setQuery}
        inputRef={inputRef}
        heatMapEnabled={heatMapEnabled}
        heatMapCount={heatMapCount}
        onToggleHeatMap={onToggleHeatMap}
      />
      <GitStatusFilterBar counts={counts} isRepo={isRepo} />
      <FileTreeBody
        {...bodyProps}
        query={query}
        projectRoot={primaryRoot}
        gitDetailedStatus={status}
        gitIsRepo={isRepo}
        gitRefresh={refresh}
        gitFilter={filter}
      />
    </div>
  );
}

function useFileTreeHooks(
  projectRoots: string[],
  singleRootProp: string | null | undefined,
  onFileSelect: (filePath: string) => void,
) {
  useRefreshFilesEvent();
  const roots = useResolvedRoots(projectRoots, singleRootProp);
  const { expandedRoots, toggleRoot } = useExpandedRoots(roots);
  const { bookmarks, setBookmarks, extraIgnorePatterns } = useFileTreeConfig();
  const { query, setQuery, handleSearchSelect } = useSearchQuery(onFileSelect);
  const [heatMapEnabled, setHeatMapEnabled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToastContext();
  const { getHeatLevel, heatMap } = useFileHeatMap(heatMapEnabled);
  const handleUnpin = useUnpinHandler(bookmarks, setBookmarks, toast);
  return {
    roots,
    expandedRoots,
    toggleRoot,
    bookmarks,
    extraIgnorePatterns,
    query,
    setQuery,
    handleSearchSelect,
    heatMapEnabled,
    setHeatMapEnabled,
    inputRef,
    getHeatLevel,
    heatMap,
    handleUnpin,
  };
}

export function FileTree({
  projectRoots,
  activeFilePath,
  onFileSelect,
  onFileOpen,
  onRemoveRoot,
  projectRoot: singleRootProp,
}: FileTreeProps): React.ReactElement {
  const h = useFileTreeHooks(projectRoots, singleRootProp, onFileSelect);
  if (h.roots.length === 0) return <EmptyFileTree />;
  return (
    <FileTreeContent
      query={h.query}
      setQuery={h.setQuery}
      inputRef={h.inputRef}
      heatMapEnabled={h.heatMapEnabled}
      heatMapCount={h.heatMap.size}
      onToggleHeatMap={() => h.setHeatMapEnabled((prev) => !prev)}
      primaryRoot={h.roots[0]}
      bodyProps={{
        roots: h.roots,
        activeFilePath,
        bookmarks: h.bookmarks,
        expandedRoots: h.expandedRoots,
        extraIgnorePatterns: h.extraIgnorePatterns,
        onFileSelect,
        onFileOpen,
        onToggleRoot: h.toggleRoot,
        onRemoveRoot,
        onSearchSelect: h.handleSearchSelect,
        onUnpin: (path) => void h.handleUnpin(path),
        getHeatLevel: h.heatMapEnabled ? h.getHeatLevel : undefined,
      }}
    />
  );
}
