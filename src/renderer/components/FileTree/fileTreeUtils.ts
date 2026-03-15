/**
 * fileTreeUtils — shared utility functions, constants, and types for the FileTree.
 *
 * Extracted from FileTree.tsx to reduce file size and improve reusability.
 */

import type { TreeNode } from './FileTreeItem';
import type { GitFileStatus } from '../../types/electron';

// ─── Constants ────────────────────────────────────────────────────────────────

export const ITEM_HEIGHT = 28;
export const OVERSCAN = 10;

/** Hardcoded directories to always skip */
export const IGNORED_DIRS_BASE = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  '__pycache__',
]);

// ─── Inline edit state types ──────────────────────────────────────────────────

export interface EditState {
  targetPath: string;
  mode: 'rename' | 'newFile' | 'newFolder';
  initialValue: string;
}

// ─── Utility functions ────────────────────────────────────────────────────────

export function buildIgnorePredicate(extraPatterns: string[]): (name: string) => boolean {
  return (name: string): boolean => {
    if (name.startsWith('.') || IGNORED_DIRS_BASE.has(name)) return true;
    for (const pattern of extraPatterns) {
      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(1);
        if (name.endsWith(suffix)) return true;
      } else {
        if (name === pattern) return true;
      }
    }
    return false;
  };
}

export function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export function normPath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function relPath(root: string, absPath: string): string {
  const rn = normPath(root);
  const an = normPath(absPath);
  return an.startsWith(rn) ? an.slice(rn.length).replace(/^\//, '') : an;
}

export function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? filePath;
}

export async function loadDirChildren(
  root: string,
  dirPath: string,
  depth: number,
  shouldIgnore: (name: string) => boolean = (n) => n.startsWith('.') || IGNORED_DIRS_BASE.has(n)
): Promise<TreeNode[]> {
  const result = await window.electronAPI.files.readDir(dirPath);
  if (!result.success || !result.items) return [];

  const nodes: TreeNode[] = [];
  for (const item of result.items) {
    if (shouldIgnore(item.name)) continue;

    const rel = relPath(root, item.path);
    nodes.push({
      name: item.name,
      path: item.path,
      relativePath: rel,
      isDirectory: item.isDirectory,
      depth,
      children: item.isDirectory ? undefined : undefined,
      isExpanded: false,
      isLoading: false,
    });
  }

  return sortNodes(nodes);
}

export function updateNodeInTree(
  nodes: TreeNode[],
  targetPath: string,
  updater: (node: TreeNode) => TreeNode
): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return updater(node);
    }
    if (node.children && node.isDirectory) {
      const updatedChildren = updateNodeInTree(node.children, targetPath, updater);
      if (updatedChildren !== node.children) {
        return { ...node, children: updatedChildren };
      }
    }
    return node;
  });
}

export function removeNodeFromTree(nodes: TreeNode[], targetPath: string): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    if (node.path === targetPath) continue;
    if (node.children && node.isDirectory) {
      const updatedChildren = removeNodeFromTree(node.children, targetPath);
      result.push({ ...node, children: updatedChildren });
    } else {
      result.push(node);
    }
  }
  return result;
}

export function flattenVisibleTree(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.isDirectory && node.isExpanded && node.children) {
      result.push(...flattenVisibleTree(node.children));
    }
  }
  return result;
}

// ─── Memoized flatten for virtualization ─────────────────────────────────────

/**
 * Identity-based memoization for flattenVisibleTree.
 * Returns a cached result when the rootNodes array reference hasn't changed.
 * React's useMemo already handles this in most call sites, but this provides
 * an additional layer for non-React callers and avoids redundant work when
 * the same nodes reference is passed from multiple locations.
 */
let _flattenCache: { key: TreeNode[]; result: TreeNode[] } | null = null;

export function flattenVisibleTreeCached(nodes: TreeNode[]): TreeNode[] {
  if (_flattenCache && _flattenCache.key === nodes) {
    return _flattenCache.result;
  }
  const result = flattenVisibleTree(nodes);
  _flattenCache = { key: nodes, result };
  return result;
}

export function collectAllFiles(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    if (!node.isDirectory) {
      result.push(node);
    }
    if (node.isDirectory && node.children) {
      result.push(...collectAllFiles(node.children));
    }
  }
  return result;
}

const STATUS_PRIORITY: Record<string, number> = {
  'D': 4,
  'M': 3,
  'A': 2,
  'R': 2,
  '?': 1,
};

export function getNodeGitStatus(
  node: TreeNode,
  gitStatusMap: Map<string, GitFileStatus>
): GitFileStatus | undefined {
  if (!node.isDirectory) {
    return gitStatusMap.get(node.relativePath);
  }

  const prefix = node.relativePath + '/';
  let worst: GitFileStatus | undefined;
  let worstPriority = 0;

  for (const [filePath, status] of gitStatusMap) {
    if (filePath.startsWith(prefix)) {
      const p = STATUS_PRIORITY[status] ?? 0;
      if (p > worstPriority) {
        worstPriority = p;
        worst = status as GitFileStatus;
      }
    }
  }

  return worst;
}

export function pathJoin(base: string, name: string): string {
  const sep = base.includes('\\') ? '\\' : '/';
  return base.endsWith(sep) ? base + name : base + sep + name;
}

export function parentDir(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) return filePath;
  const parent = normalized.slice(0, lastSlash);
  if (filePath.includes('\\')) {
    return parent.replace(/\//g, '\\');
  }
  return parent;
}
