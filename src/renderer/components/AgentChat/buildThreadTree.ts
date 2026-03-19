import type { AgentChatThreadRecord } from '../../types/electron';

export interface ThreadTreeNode {
  thread: AgentChatThreadRecord;
  children: ThreadTreeNode[];
  depth: number;
}

export function buildThreadTree(threads: AgentChatThreadRecord[]): ThreadTreeNode[] {
  const nodes = new Map<string, ThreadTreeNode>();

  for (const thread of threads) {
    nodes.set(thread.id, { thread, children: [], depth: 0 });
  }

  const roots: ThreadTreeNode[] = [];
  for (const thread of threads) {
    const node = nodes.get(thread.id)!;
    const parentId = thread.branchInfo?.parentThreadId;
    if (parentId && nodes.has(parentId)) {
      nodes.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Compute depths via DFS after tree structure is complete
  function assignDepths(nodes: ThreadTreeNode[], depth: number): void {
    for (const node of nodes) {
      node.depth = depth;
      assignDepths(node.children, depth + 1);
    }
  }
  assignDepths(roots, 0);

  return roots;
}

/** Flatten a thread tree into a depth-first ordered list for rendering. */
export function flattenThreadTree(roots: ThreadTreeNode[]): ThreadTreeNode[] {
  const result: ThreadTreeNode[] = [];
  function walk(nodes: ThreadTreeNode[]): void {
    for (const node of nodes) {
      result.push(node);
      walk(node.children);
    }
  }
  walk(roots);
  return result;
}
