import Fuse from 'fuse.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useProjectFileIndex } from '../../hooks/useProjectFileIndex';
import type { MatchRange,TreeNode } from './FileTreeItem';
import { FileTreeItem } from './FileTreeItem';

export interface SearchOverlayProps {
  roots: string[];
  extraIgnorePatterns: string[];
  query: string;
  activeFilePath: string | null;
  onFileSelect: (path: string) => void;
}

interface SearchResult {
  node: TreeNode;
  ranges: MatchRange[];
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
  zIndex: 10,
  backgroundColor: 'var(--surface-overlay)',
  backdropFilter: 'blur(24px) saturate(140%)',
  WebkitBackdropFilter: 'blur(24px) saturate(140%)',
};

const EMPTY_STATE_STYLE: React.CSSProperties = {
  ...OVERLAY_STYLE,
  padding: '16px 12px',
  fontSize: '0.8125rem',
  textAlign: 'center',
};

function toSearchNode(entry: { name: string; path: string; relativePath: string }): TreeNode {
  return {
    name: entry.name,
    path: entry.path,
    relativePath: entry.relativePath,
    isDirectory: false,
    depth: 0,
    isExpanded: false,
    isLoading: false,
  };
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

function useSearchResults(roots: string[], _extraIgnorePatterns: string[], query: string): { isLoading: boolean; searchResults: SearchResult[] } {
  const { allFiles, isIndexing } = useProjectFileIndex({ roots, enabled: query.trim().length > 0 });
  const isLoading = isIndexing;
  const searchNodes = useMemo(() => allFiles.map((file) => toSearchNode(file)), [allFiles]);
  const fuse = useMemo(() => new Fuse(searchNodes, {
    keys: ['relativePath', 'name'],
    threshold: 0.4,
    includeMatches: true,
    minMatchCharLength: 1,
  }), [searchNodes]);

  const searchResults = useMemo(() => buildSearchResults(fuse, query), [fuse, query]);

  return { isLoading, searchResults };
}

function SearchOverlayEmptyState({ label }: { label: string }): React.ReactElement {
  return <div className="text-text-semantic-faint" style={EMPTY_STATE_STYLE}>{label}</div>;
}

const ROW_HEIGHT = 28;
const V_OVERSCAN = 5;

function useOverlayScroll(ref: React.RefObject<HTMLDivElement | null>): { scrollTop: number; viewHeight: number } {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(400);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = (): void => { setScrollTop(el.scrollTop); };
    const ro = new ResizeObserver(() => { setViewHeight(el.clientHeight); setScrollTop(el.scrollTop); });
    el.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(el);
    setViewHeight(el.clientHeight);
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, [ref]);
  return { scrollTop, viewHeight };
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
  const ref = useRef<HTMLDivElement>(null);
  const { scrollTop, viewHeight } = useOverlayScroll(ref);
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - V_OVERSCAN);
  const end = Math.min(searchResults.length, Math.ceil((scrollTop + viewHeight) / ROW_HEIGHT) + V_OVERSCAN);

  return (
    <div ref={ref} style={{ ...OVERLAY_STYLE, overflowY: 'auto' }}>
      <div style={{ height: searchResults.length * ROW_HEIGHT, position: 'relative' }}>
        {searchResults.slice(start, end).map(({ node, ranges }, i) => (
          <div key={node.path} style={{ position: 'absolute', top: (start + i) * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT }}>
            <FileTreeItem
              node={node} depth={0} isActive={node.path === activeFilePath} isFocused={false}
              searchMode={true} matchRanges={ranges} isBookmarked={false} isEditing={false}
              onClick={(item) => onFileSelect(item.path)} onContextMenu={() => { }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SearchOverlay({
  roots,
  extraIgnorePatterns,
  query,
  activeFilePath,
  onFileSelect,
}: SearchOverlayProps): React.ReactElement {
  const { isLoading, searchResults } = useSearchResults(roots, extraIgnorePatterns, query);
  if (searchResults.length === 0) {
    return <SearchOverlayEmptyState label={isLoading ? 'Indexing project files...' : `No files match "${query}"`} />;
  }

  return <SearchOverlayResults searchResults={searchResults} activeFilePath={activeFilePath} onFileSelect={onFileSelect} />;
}
