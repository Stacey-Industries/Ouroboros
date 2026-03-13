/**
 * SearchOverlay — cross-root fuzzy file search using Fuse.js.
 *
 * Collects files from all project roots via recursive directory scan
 * and displays matching results in a floating overlay above the tree.
 *
 * Extracted from FileTree.tsx.
 */

import React, { useState, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import type { TreeNode, MatchRange } from './FileTreeItem';
import { FileTreeItem } from './FileTreeItem';
import { IGNORED_DIRS_BASE, relPath } from './fileTreeUtils';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SearchOverlayProps {
  roots: string[];
  query: string;
  activeFilePath: string | null;
  onFileSelect: (path: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SearchOverlay({
  roots,
  query,
  activeFilePath,
  onFileSelect,
}: SearchOverlayProps): React.ReactElement {
  const [allFiles, setAllFiles] = useState<TreeNode[]>([]);

  // Re-scan roots when query becomes non-empty or roots change
  useEffect(() => {
    if (!query.trim()) return;
    let cancelled = false;

    async function scanRoot(root: string): Promise<TreeNode[]> {
      const result = await window.electronAPI.files.readDir(root);
      if (!result.success || !result.items) return [];

      const nodes: TreeNode[] = [];
      for (const item of result.items) {
        if (
          item.name.startsWith('.') ||
          IGNORED_DIRS_BASE.has(item.name)
        ) continue;

        const rel = relPath(root, item.path);
        if (!item.isDirectory) {
          nodes.push({
            name: item.name,
            path: item.path,
            relativePath: rel,
            isDirectory: false,
            depth: 0,
            isExpanded: false,
            isLoading: false,
          });
        } else {
          // Recurse one level deep for a quick but useful result set
          const children = await scanRoot(item.path);
          nodes.push(...children);
        }
      }
      return nodes;
    }

    void Promise.all(roots.map(scanRoot)).then((results) => {
      if (!cancelled) setAllFiles(results.flat());
    });

    return () => { cancelled = true; };
  }, [query, roots]);

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

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return fuse.search(query).slice(0, 50).map((result) => {
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
      return { node: result.item, ranges };
    });
  }, [query, fuse]);

  if (searchResults.length === 0) {
    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'var(--bg-secondary)',
          zIndex: 10,
          padding: '16px 12px',
          color: 'var(--text-faint)',
          fontSize: '0.8125rem',
          textAlign: 'center',
        }}
      >
        No files match &quot;{query}&quot;
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--bg-secondary)',
        zIndex: 10,
        overflowY: 'auto',
      }}
    >
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
          onClick={(n) => onFileSelect(n.path)}
          onContextMenu={() => {}}
        />
      ))}
    </div>
  );
}
