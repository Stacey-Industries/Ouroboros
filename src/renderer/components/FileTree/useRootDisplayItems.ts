/**
 * useRootDisplayItems.ts — display item computation for the file tree, including nesting support.
 * Extracted from useRootSectionInteractions.ts to keep file sizes manageable.
 */

import { useMemo } from 'react';

import { applyNesting } from './fileNestingRules';
import type { TreeNode } from './FileTreeItem';
import { useFileTreeStore } from './fileTreeStore';
import type { EditState } from './fileTreeUtils';

/**
 * Like flattenVisibleTree but also includes nested children (from file nesting)
 * when the parent has isNestExpanded set.
 */
function flattenVisibleTreeWithNesting(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.isDirectory && node.isExpanded && node.children) {
      result.push(...flattenVisibleTreeWithNesting(node.children));
    }
    if (node.hasNestedChildren && node.isNestExpanded && node.nestedChildren) {
      for (const child of node.nestedChildren) {
        result.push({ ...child, depth: node.depth + 1 });
      }
    }
  }
  return result;
}

function applyNestExpansionState(nodes: TreeNode[], expandedPaths: Set<string>): TreeNode[] {
  return nodes.map((node) => {
    let updated = node;
    if (node.hasNestedChildren) {
      const isExpanded = expandedPaths.has(node.path);
      if (node.isNestExpanded !== isExpanded) updated = { ...node, isNestExpanded: isExpanded };
    }
    if (updated.isDirectory && updated.children) {
      const newChildren = applyNestExpansionState(updated.children, expandedPaths);
      if (newChildren !== updated.children) updated = { ...updated, children: newChildren };
    }
    return updated;
  });
}

export function buildDisplayItems(flatRows: TreeNode[], editState: EditState | null): Array<{ node: TreeNode }> {
  const base = flatRows.map((node) => ({ node }));
  if (!editState || editState.mode === 'rename') return base;

  const index = base.findIndex((item) => item.node.path === editState.targetPath);
  const placeholder: TreeNode = {
    name: '',
    path: '__new_item_placeholder__',
    relativePath: '',
    isDirectory: editState.mode === 'newFolder',
    depth: index === -1 ? 0 : base[index].node.depth + 1,
    isExpanded: false,
    isLoading: false,
  };

  if (index === -1) return [{ node: placeholder }, ...base];
  return [...base.slice(0, index + 1), { node: placeholder }, ...base.slice(index + 1)];
}

export function useDisplayItems(rootNodes: TreeNode[], editState: EditState | null): Array<{ node: TreeNode }> {
  const nestingEnabled = useFileTreeStore((s) => s.nestingEnabled);
  const nestExpandedPaths = useFileTreeStore((s) => s.nestExpandedPaths);

  const processedNodes = useMemo(() => {
    if (!nestingEnabled) return rootNodes;
    const nested = applyNesting(rootNodes);
    return applyNestExpansionState(nested, nestExpandedPaths);
  }, [rootNodes, nestingEnabled, nestExpandedPaths]);

  const flatRows = useMemo(() => flattenVisibleTreeWithNesting(processedNodes), [processedNodes]);
  return useMemo(() => buildDisplayItems(flatRows, editState), [editState, flatRows]);
}
