/**
 * BranchTreeView.tsx — Wave 23 Phase B
 *
 * Indented tree of all threads rooted at a given thread.
 * Fetched via window.electronAPI.agentChat.listBranches(rootThreadId).
 */
import React, { useCallback, useEffect, useState } from 'react';

import type { BranchNode } from '../../types/electron';

export interface BranchTreeViewProps {
  rootThreadId: string;
  rootTitle: string;
  activeThreadId: string;
  onSelect: (threadId: string) => void;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function SideChatIcon(): React.ReactElement {
  return (
    <span
      className="shrink-0 text-text-semantic-muted"
      title="Side chat"
      aria-label="Side chat"
    >
      &#x1F4AC;
    </span>
  );
}

function BranchNodeIcon(): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

// ── Tree node ─────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: BranchNode;
  activeThreadId: string;
  depth: number;
  onSelect: (threadId: string) => void;
}

function TreeNodeRow({ node, activeThreadId, depth, onSelect }: TreeNodeProps): React.ReactElement {
  const isActive = node.id === activeThreadId;
  const label = node.branchName ?? node.id.slice(0, 8);
  const indent = depth * 16;

  return (
    <>
      <button
        className={[
          'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors duration-75',
          isActive
            ? 'bg-interactive-accent-subtle text-interactive-accent font-medium'
            : 'text-text-semantic-primary hover:bg-surface-raised',
        ].join(' ')}
        style={{ paddingLeft: 8 + indent }}
        onClick={() => onSelect(node.id)}
        aria-current={isActive ? 'true' : undefined}
        title={label}
      >
        {node.isSideChat ? <SideChatIcon /> : <BranchNodeIcon />}
        <span className="flex-1 truncate">{label}</span>
      </button>
      {node.children.map((child) => (
        <TreeNodeRow
          key={child.id}
          node={child}
          activeThreadId={activeThreadId}
          depth={depth + 1}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

// ── Root row ──────────────────────────────────────────────────────────────────

function RootRow({
  rootThreadId,
  rootTitle,
  activeThreadId,
  onSelect,
}: {
  rootThreadId: string;
  rootTitle: string;
  activeThreadId: string;
  onSelect: (id: string) => void;
}): React.ReactElement {
  const isActive = rootThreadId === activeThreadId;
  return (
    <button
      className={[
        'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs font-medium transition-colors duration-75',
        isActive
          ? 'bg-interactive-accent-subtle text-interactive-accent'
          : 'text-text-semantic-primary hover:bg-surface-raised',
      ].join(' ')}
      onClick={() => onSelect(rootThreadId)}
      aria-current={isActive ? 'true' : undefined}
      title={rootTitle}
    >
      <span className="shrink-0 text-[10px] text-text-semantic-muted" aria-hidden="true">
        &#x2605;
      </span>
      <span className="flex-1 truncate">{rootTitle}</span>
    </button>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function useBranchTree(
  rootThreadId: string,
): { nodes: BranchNode[]; loading: boolean; error: string | null; reload: () => void } {
  const [nodes, setNodes] = useState<BranchNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.electronAPI.agentChat
      .listBranches(rootThreadId)
      .then((result) => {
        if (cancelled) return;
        if (result.success) {
          setNodes(result.branches ?? []);
        } else {
          setError(result.error ?? 'Failed to load branches');
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load branches');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rootThreadId, tick]);

  return { nodes, loading, error, reload };
}

// ── Loaded tree ───────────────────────────────────────────────────────────────

function BranchTreeLoaded({
  nodes,
  rootThreadId,
  rootTitle,
  activeThreadId,
  onSelect,
}: {
  nodes: BranchNode[];
  rootThreadId: string;
  rootTitle: string;
  activeThreadId: string;
  onSelect: (id: string) => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5 py-1" role="tree" aria-label="Branch tree">
      <RootRow
        rootThreadId={rootThreadId}
        rootTitle={rootTitle}
        activeThreadId={activeThreadId}
        onSelect={onSelect}
      />
      {nodes.map((node) => (
        <TreeNodeRow
          key={node.id}
          node={node}
          activeThreadId={activeThreadId}
          depth={1}
          onSelect={onSelect}
        />
      ))}
      {nodes.length === 0 && (
        <div className="px-3 py-1.5 text-[11px] text-text-semantic-muted">No branches yet</div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function BranchTreeView({
  rootThreadId,
  rootTitle,
  activeThreadId,
  onSelect,
}: BranchTreeViewProps): React.ReactElement {
  const { nodes, loading, error } = useBranchTree(rootThreadId);

  if (loading) {
    return (
      <div className="px-3 py-2 text-xs text-text-semantic-muted" aria-busy="true">
        Loading branches…
      </div>
    );
  }
  if (error) {
    return (
      <div className="px-3 py-2 text-xs text-status-error" role="alert">
        {error}
      </div>
    );
  }
  return (
    <BranchTreeLoaded
      nodes={nodes}
      rootThreadId={rootThreadId}
      rootTitle={rootTitle}
      activeThreadId={activeThreadId}
      onSelect={onSelect}
    />
  );
}
