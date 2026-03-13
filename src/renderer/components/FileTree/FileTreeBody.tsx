import React from 'react';
import { SearchOverlay } from './SearchOverlay';
import { RootSection } from './RootSection';
import { PinnedSection } from './PinnedSection';
import { useFileHeatMap } from '../../hooks/useFileHeatMap';

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

export function FileTreeBody({ query, roots, activeFilePath, bookmarks, expandedRoots, extraIgnorePatterns, onFileSelect, onToggleRoot, onRemoveRoot, onSearchSelect, onUnpin, getHeatLevel }: FileTreeBodyProps): React.ReactElement {
  return (
    <div style={treeBodyStyle}>
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
    </div>
  );
}
