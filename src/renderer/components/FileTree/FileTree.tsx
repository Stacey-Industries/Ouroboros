/**
 * FileTree - multi-root hierarchical tree view.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { EmptyState } from '../shared';
import { useToastContext } from '../../contexts/ToastContext';
import { useFileHeatMap } from '../../hooks/useFileHeatMap';
import { useGitStatusDetailed } from '../../hooks/useGitStatusDetailed';
import { FileTreeBody } from './FileTreeBody';
import { FileTreeSearchBar } from './FileTreeSearchBar';
import { GitBranchIndicator } from './GitBranchIndicator';
import { GitStatusFilterBar, computeStatusCounts } from './GitStatusFilter';
import { useFileTreeStore } from './fileTreeStore';

export interface FileTreeProps {
  projectRoots: string[];
  activeFilePath: string | null;
  onFileSelect: (filePath: string) => void;
  onRemoveRoot?: (root: string) => void;
  projectRoot?: string | null;
}

type ToastFn = ReturnType<typeof useToastContext>['toast'];

const treeContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
};

function resolveRoots(
  projectRoots: string[],
  singleRootProp?: string | null
): string[] {
  if (projectRoots.length > 0) return projectRoots;
  if (singleRootProp) return [singleRootProp];
  return [];
}

function useResolvedRoots(
  projectRoots: string[],
  singleRootProp?: string | null
): string[] {
  return useMemo(
    () => resolveRoots(projectRoots, singleRootProp),
    [projectRoots, singleRootProp]
  );
}

/**
 * useExpandedRoots — backed by the Zustand fileTreeStore.
 *
 * expandedPaths in the store tracks ALL expanded paths (roots + subdirectories).
 * This hook ensures newly-added roots are auto-expanded, then delegates
 * toggle/read to the store.
 */
function useExpandedRoots(roots: string[]): {
  expandedRoots: Set<string>;
  toggleRoot: (root: string) => void;
} {
  const expandedPaths = useFileTreeStore((s) => s.expandedPaths);
  const ensureExpanded = useFileTreeStore((s) => s.ensureExpanded);
  const toggleExpand = useFileTreeStore((s) => s.toggleExpand);

  // Auto-expand newly added roots
  useEffect(() => {
    for (const root of roots) {
      ensureExpanded(root);
    }
  }, [roots, ensureExpanded]);

  return { expandedRoots: expandedPaths, toggleRoot: toggleExpand };
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
  toast: ToastFn
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
    [bookmarks, setBookmarks, toast]
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
function useSearchQuery(
  onFileSelect: (filePath: string) => void
): {
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
    [storeSetQuery]
  );

  const handleSearchSelect = useCallback(
    (path: string) => {
      onFileSelect(path);
      storeSetQuery('');
    },
    [onFileSelect, storeSetQuery]
  );

  return { query, setQuery, handleSearchSelect };
}

function EmptyFileTree(): React.ReactElement {
  return (
    <div style={treeContainerStyle}>
      <EmptyState
        icon="folder"
        title="Open a folder to get started"
        description="Use the project picker above or open a folder from the File menu."
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
  bodyProps: React.ComponentProps<typeof FileTreeBody>;
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
        query={query}
        {...bodyProps}
        projectRoot={primaryRoot}
        gitDetailedStatus={status}
        gitIsRepo={isRepo}
        gitRefresh={refresh}
        gitFilter={filter}
      />
    </div>
  );
}

export function FileTree({ projectRoots, activeFilePath, onFileSelect, onRemoveRoot, projectRoot: singleRootProp }: FileTreeProps): React.ReactElement {
  const roots = useResolvedRoots(projectRoots, singleRootProp);
  const { expandedRoots, toggleRoot } = useExpandedRoots(roots);
  const { bookmarks, setBookmarks, extraIgnorePatterns } = useFileTreeConfig();
  const { query, setQuery, handleSearchSelect } = useSearchQuery(onFileSelect);
  const [heatMapEnabled, setHeatMapEnabled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToastContext();
  const { getHeatLevel, heatMap } = useFileHeatMap(heatMapEnabled);
  const handleUnpin = useUnpinHandler(bookmarks, setBookmarks, toast);

  if (roots.length === 0) return <EmptyFileTree />;

  return (
    <FileTreeContent
      query={query}
      setQuery={setQuery}
      inputRef={inputRef}
      heatMapEnabled={heatMapEnabled}
      heatMapCount={heatMap.size}
      onToggleHeatMap={() => setHeatMapEnabled((prev) => !prev)}
      primaryRoot={roots[0]}
      bodyProps={{
        roots,
        activeFilePath,
        bookmarks,
        expandedRoots,
        extraIgnorePatterns,
        onFileSelect,
        onToggleRoot: toggleRoot,
        onRemoveRoot,
        onSearchSelect: handleSearchSelect,
        onUnpin: (path) => void handleUnpin(path),
        getHeatLevel: heatMapEnabled ? getHeatLevel : undefined,
      }}
    />
  );
}
