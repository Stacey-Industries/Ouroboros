import React from 'react';

import { useFileHeatMap } from '../../hooks/useFileHeatMap';
import type { DetailedGitStatus } from '../../hooks/useGitStatusDetailed';
import type { TreeFilter } from './fileTreeStore';
import { GitFilteredView } from './GitStatusFilter';
import { PinnedSection } from './PinnedSection';
import { RootSection } from './RootSection';
import { SearchOverlay } from './SearchOverlay';

export interface FileTreeBodyProps {
  roots: string[];
  query: string;
  activeFilePath: string | null;
  bookmarks: string[];
  expandedRoots: Set<string>;
  extraIgnorePatterns: string[];
  onFileSelect: (filePath: string) => void;
  /** Called on double-click (opens permanent tab). Falls back to onFileSelect if not provided. */
  onFileOpen?: (filePath: string) => void;
  onToggleRoot: (root: string) => void;
  onRemoveRoot?: (root: string) => void;
  onSearchSelect: (path: string) => void;
  onUnpin: (path: string) => void;
  getHeatLevel?: ReturnType<typeof useFileHeatMap>['getHeatLevel'];
  /** Primary project root for git operations */
  projectRoot?: string;
  /** Detailed git status (staged/unstaged) */
  gitDetailedStatus?: DetailedGitStatus;
  /** Whether the project root is a git repo */
  gitIsRepo?: boolean;
  /** Force refresh git status */
  gitRefresh?: () => void;
  /** Current git status filter */
  gitFilter?: TreeFilter;
}

const treeBodyStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  position: 'relative',
};

function RootSections({
  roots,
  expandedRoots,
  activeFilePath,
  onFileSelect,
  onFileOpen,
  onToggleRoot,
  onRemoveRoot,
  bookmarks,
  extraIgnorePatterns,
  getHeatLevel,
}: Omit<FileTreeBodyProps, 'query' | 'onSearchSelect' | 'onUnpin'>): React.ReactElement {
  return (
    <>
      {roots.map((root) => (
        <RootSection
          key={root}
          root={root}
          isExpanded={expandedRoots.has(root)}
          onToggle={() => onToggleRoot(root)}
          activeFilePath={activeFilePath}
          onFileSelect={onFileSelect}
          onFileOpen={onFileOpen}
          onRemove={
            roots.length > 1 && onRemoveRoot ? () => onRemoveRoot(root) : undefined
          }
          bookmarks={bookmarks}
          extraIgnorePatterns={extraIgnorePatterns}
          getHeatLevel={getHeatLevel}
        />
      ))}
    </>
  );
}

type NormalTreeViewProps = Omit<FileTreeBodyProps, 'projectRoot' | 'gitDetailedStatus' | 'gitIsRepo' | 'gitRefresh' | 'gitFilter'>;

function NormalTreeView(p: NormalTreeViewProps): React.ReactElement {
  return (
    <>
      <PinnedSection bookmarks={p.bookmarks} activeFilePath={p.activeFilePath} onFileSelect={p.onFileSelect} onUnpin={p.onUnpin} />
      <RootSections
        roots={p.roots}
        expandedRoots={p.expandedRoots}
        activeFilePath={p.activeFilePath}
        onFileSelect={p.onFileSelect}
        onFileOpen={p.onFileOpen}
        onToggleRoot={p.onToggleRoot}
        onRemoveRoot={p.onRemoveRoot}
        bookmarks={p.bookmarks}
        extraIgnorePatterns={p.extraIgnorePatterns}
        getHeatLevel={p.getHeatLevel}
      />
      {p.query.trim().length > 0 && (
        <SearchOverlay roots={p.roots} extraIgnorePatterns={p.extraIgnorePatterns} query={p.query} activeFilePath={p.activeFilePath} onFileSelect={p.onSearchSelect} />
      )}
    </>
  );
}

export function FileTreeBody(p: FileTreeBodyProps): React.ReactElement {
  const isFiltered = p.gitFilter != null && p.gitFilter !== 'all';

  return (
    <div style={treeBodyStyle}>
      {isFiltered && p.projectRoot && p.gitDetailedStatus ? (
        <GitFilteredView status={p.gitDetailedStatus} projectRoot={p.projectRoot} onFileSelect={p.onFileSelect} />
      ) : (
        <NormalTreeView
          query={p.query} roots={p.roots} activeFilePath={p.activeFilePath}
          bookmarks={p.bookmarks} expandedRoots={p.expandedRoots} extraIgnorePatterns={p.extraIgnorePatterns}
          onFileSelect={p.onFileSelect} onFileOpen={p.onFileOpen} onToggleRoot={p.onToggleRoot}
          onRemoveRoot={p.onRemoveRoot} onSearchSelect={p.onSearchSelect} onUnpin={p.onUnpin} getHeatLevel={p.getHeatLevel}
        />
      )}
    </div>
  );
}
