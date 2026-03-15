import React from 'react';
import { SearchOverlay } from './SearchOverlay';
import { RootSection } from './RootSection';
import { PinnedSection } from './PinnedSection';
import { StagingArea } from './StagingArea';
import { GitFilteredView } from './GitStatusFilter';
import { useFileHeatMap } from '../../hooks/useFileHeatMap';
import type { DetailedGitStatus } from '../../hooks/useGitStatusDetailed';
import type { TreeFilter } from './fileTreeStore';

export interface FileTreeBodyProps {
  roots: string[];
  query: string;
  activeFilePath: string | null;
  bookmarks: string[];
  expandedRoots: Set<string>;
  extraIgnorePatterns: string[];
  onFileSelect: (filePath: string) => void;
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
  overflowY: 'auto',
  overflowX: 'hidden',
  position: 'relative',
};

function RootSections({
  roots,
  expandedRoots,
  activeFilePath,
  onFileSelect,
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

export function FileTreeBody({ query, roots, activeFilePath, bookmarks, expandedRoots, extraIgnorePatterns, onFileSelect, onToggleRoot, onRemoveRoot, onSearchSelect, onUnpin, getHeatLevel, projectRoot, gitDetailedStatus, gitIsRepo, gitRefresh, gitFilter }: FileTreeBodyProps): React.ReactElement {
  const isFiltered = gitFilter != null && gitFilter !== 'all';

  return (
    <div style={treeBodyStyle}>
      {/* Staging area at the very top when in a git repo */}
      {gitIsRepo && projectRoot && gitDetailedStatus && gitRefresh && (
        <StagingArea
          projectRoot={projectRoot}
          status={gitDetailedStatus}
          onRefresh={gitRefresh}
          onFileSelect={onFileSelect}
        />
      )}
      {/* When a git filter is active, show flat filtered list instead of tree */}
      {isFiltered && projectRoot && gitDetailedStatus ? (
        <GitFilteredView
          status={gitDetailedStatus}
          projectRoot={projectRoot}
          onFileSelect={onFileSelect}
        />
      ) : (
        <>
          <PinnedSection
            bookmarks={bookmarks}
            activeFilePath={activeFilePath}
            onFileSelect={onFileSelect}
            onUnpin={onUnpin}
          />
          <RootSections
            roots={roots}
            expandedRoots={expandedRoots}
            activeFilePath={activeFilePath}
            onFileSelect={onFileSelect}
            onToggleRoot={onToggleRoot}
            onRemoveRoot={onRemoveRoot}
            bookmarks={bookmarks}
            extraIgnorePatterns={extraIgnorePatterns}
            getHeatLevel={getHeatLevel}
          />
          {query.trim().length > 0 && (
            <SearchOverlay
              roots={roots}
              query={query}
              activeFilePath={activeFilePath}
              onFileSelect={onSearchSelect}
            />
          )}
        </>
      )}
    </div>
  );
}
