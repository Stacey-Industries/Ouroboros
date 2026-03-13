import React, { useState, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import type { TreeNode, MatchRange } from './FileTreeItem';
import { FileTreeItem } from './FileTreeItem';
import { IGNORED_DIRS_BASE, relPath } from './fileTreeUtils';

export interface SearchOverlayProps {
  roots: string[];
  query: string;
  activeFilePath: string | null;
  onFileSelect: (path: string) => void;
}

interface SearchResult {
  node: TreeNode;
  ranges: MatchRange[];
}

interface SearchEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface SearchMatch {
  key?: string | number;
  indices?: ReadonlyArray<readonly [number, number]>;
}

const OVERLAY_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'var(--bg-secondary)',
  zIndex: 10,
};

const EMPTY_STATE_STYLE: React.CSSProperties = {
  ...OVERLAY_STYLE,
  padding: '16px 12px',
  color: 'var(--text-faint)',
  fontSize: '0.8125rem',
  textAlign: 'center',
};

function shouldScanEntry(name: string): boolean {
  return !name.startsWith('.') && !IGNORED_DIRS_BASE.has(name);
}

function toSearchNode(root: string, entry: SearchEntry): TreeNode {
  return {
    name: entry.name,
    path: entry.path,
    relativePath: relPath(root, entry.path),
    isDirectory: false,
    depth: 0,
    isExpanded: false,
    isLoading: false,
  };
}

async function scanDirectory(root: string, dirPath = root): Promise<TreeNode[]> {
  const result = await window.electronAPI.files.readDir(dirPath);
  if (!result.success || !result.items) {
    return [];
  }

  const entries = result.items.filter((item) => shouldScanEntry(item.name));
  const batches = entries.map((item) => (
    item.isDirectory
      ? scanDirectory(root, item.path)
      : Promise.resolve([toSearchNode(root, item)])
  ));
  const files = await Promise.all(batches);
  return files.flat();
}

function collectMatchRanges(matches?: readonly SearchMatch[]): MatchRange[] {
  if (!matches) {
    return [];
  }

  return matches
    .filter((match) => match.key === 'name' && !!match.indices)
    .flatMap((match) => (
      match.indices ?? []
    ).map(([start, end]) => ({ start, end: end + 1 })));
}

function buildSearchResults(fuse: Fuse<TreeNode>, query: string): SearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  return fuse.search(trimmed).slice(0, 50).map((result) => ({
    node: result.item,
    ranges: collectMatchRanges(result.matches),
  }));
}

function useSearchResults(roots: string[], query: string): SearchResult[] {
  const [allFiles, setAllFiles] = useState<TreeNode[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setAllFiles([]);
      return;
    }

    let cancelled = false;
    void Promise.all(roots.map((root) => scanDirectory(root))).then((results) => {
      if (!cancelled) {
        setAllFiles(results.flat());
      }
    });

    return () => {
      cancelled = true;
    };
  }, [query, roots]);

  const fuse = useMemo(() => new Fuse(allFiles, {
    keys: ['relativePath', 'name'],
    threshold: 0.4,
    includeMatches: true,
    minMatchCharLength: 1,
  }), [allFiles]);

  return useMemo(() => buildSearchResults(fuse, query), [fuse, query]);
}

function SearchOverlayEmptyState({ query }: { query: string }): React.ReactElement {
  return <div style={EMPTY_STATE_STYLE}>No files match &quot;{query}&quot;</div>;
}

function SearchOverlayResults({
  searchResults,
  activeFilePath,
  onFileSelect,
}: {
  searchResults: SearchResult[];
  activeFilePath: string | null;
  onFileSelect: (path: string) => void;
}): React.ReactElement {
  return (
    <div style={{ ...OVERLAY_STYLE, overflowY: 'auto' }}>
      {searchResults.map(({ node, ranges }) => (
        <FileTreeItem
          key={node.path}
          node={node}
          depth={0}
          isActive={node.path === activeFilePath}
          isFocused={false}
          searchMode={true}
          matchRanges={ranges}
          isBookmarked={false}
          isEditing={false}
          onClick={(item) => onFileSelect(item.path)}
          onContextMenu={() => {}}
        />
      ))}
    </div>
  );
}

export function SearchOverlay({
  roots,
  query,
  activeFilePath,
  onFileSelect,
}: SearchOverlayProps): React.ReactElement {
  const searchResults = useSearchResults(roots, query);
  return searchResults.length === 0
    ? <SearchOverlayEmptyState query={query} />
    : <SearchOverlayResults searchResults={searchResults} activeFilePath={activeFilePath} onFileSelect={onFileSelect} />;
}
