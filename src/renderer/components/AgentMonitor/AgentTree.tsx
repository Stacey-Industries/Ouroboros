/**
 * AgentTree.tsx — Tree view for parent-child agent relationships.
 *
 * Groups agents by parent-child relationship:
 * - Root agents (no parent) at top level
 * - Child agents indented under their parent with connecting lines
 * - Each node renders an AgentCard (reuse existing)
 * - Collapsible branches (click toggle to collapse/expand children)
 */

import React, { useState, useCallback, memo } from 'react';
import type { AgentSession } from './types';
import { AgentCard } from './AgentCard';

// ── Types ────────────────────────────────────────────────────────────────────

interface TreeNode {
  session: AgentSession;
  children: TreeNode[];
}

// ── Tree building ────────────────────────────────────────────────────────────

/**
 * Build a forest of TreeNodes from a flat list of sessions.
 * Sessions with parentSessionId are nested under their parent.
 * If a parent is missing (dismissed or not yet arrived), the child is promoted to root.
 */
function buildTree(sessions: AgentSession[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const sessionIds = new Set(sessions.map((s) => s.id));

  // Create nodes
  for (const session of sessions) {
    nodeMap.set(session.id, { session, children: [] });
  }

  const roots: TreeNode[] = [];

  for (const session of sessions) {
    const node = nodeMap.get(session.id)!;
    const parentId = session.parentSessionId;

    if (parentId && sessionIds.has(parentId)) {
      const parent = nodeMap.get(parentId)!;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Returns true if any session in the list has a parentSessionId
 * that references another session in the list.
 */
export function hasTreeStructure(sessions: AgentSession[]): boolean {
  const ids = new Set(sessions.map((s) => s.id));
  return sessions.some((s) => s.parentSessionId && ids.has(s.parentSessionId));
}

// ── Collapse toggle ──────────────────────────────────────────────────────────

interface BranchToggleProps {
  expanded: boolean;
  childCount: number;
  onToggle: () => void;
}

const BranchToggle = memo(function BranchToggle({
  expanded,
  childCount,
  onToggle,
}: BranchToggleProps): React.ReactElement {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors"
      style={{
        color: 'var(--text-faint)',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)';
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
      title={expanded ? 'Collapse subagents' : 'Expand subagents'}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{
          transform: expanded ? 'rotate(90deg)' : 'none',
          transition: 'transform 150ms ease',
        }}
      >
        <path
          d="M3 1.5L7 5L3 8.5"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{childCount} subagent{childCount !== 1 ? 's' : ''}</span>
    </button>
  );
});

// ── Tree node renderer ───────────────────────────────────────────────────────

const INDENT_PX = 16;

interface TreeNodeRendererProps {
  node: TreeNode;
  depth: number;
  onDismiss: (id: string) => void;
  collapsedIds: Set<string>;
  onToggleCollapse: (id: string) => void;
  isLastChild: boolean;
}

const TreeNodeRenderer = memo(function TreeNodeRenderer({
  node,
  depth,
  onDismiss,
  collapsedIds,
  onToggleCollapse,
  isLastChild,
}: TreeNodeRendererProps): React.ReactElement {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsedIds.has(node.session.id);
  const indent = depth * INDENT_PX;

  const handleToggle = useCallback(() => {
    onToggleCollapse(node.session.id);
  }, [onToggleCollapse, node.session.id]);

  return (
    <div className="relative">
      {/* Indent guides for nesting depth */}
      {depth > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            pointerEvents: 'none',
          }}
        >
          {Array.from({ length: depth }, (_, i) => (
            <span
              key={`guide-${i}`}
              style={{
                position: 'absolute',
                left: `${i * INDENT_PX + 8}px`,
                top: 0,
                bottom: i === depth - 1 && isLastChild && !hasChildren ? '50%' : 0,
                width: '1px',
                backgroundColor: 'var(--border-muted)',
                opacity: 0.5,
              }}
            />
          ))}

          {/* Horizontal connector from guide to card */}
          <span
            style={{
              position: 'absolute',
              left: `${(depth - 1) * INDENT_PX + 8}px`,
              top: '18px',
              width: `${INDENT_PX - 4}px`,
              height: '1px',
              backgroundColor: 'var(--border-muted)',
              opacity: 0.5,
            }}
          />
        </div>
      )}

      {/* Agent card with left padding for indent */}
      <div style={{ paddingLeft: `${indent}px` }}>
        <AgentCard
          session={node.session}
          onDismiss={onDismiss}
        />

        {/* Branch toggle for nodes with children */}
        {hasChildren && (
          <div
            className="flex items-center"
            style={{
              paddingLeft: '8px',
              borderBottom: '1px solid var(--border-muted)',
            }}
          >
            <BranchToggle
              expanded={!isCollapsed}
              childCount={node.children.length}
              onToggle={handleToggle}
            />
          </div>
        )}
      </div>

      {/* Render children if not collapsed */}
      {hasChildren && !isCollapsed && (
        <div>
          {node.children.map((child, idx) => (
            <TreeNodeRenderer
              key={child.session.id}
              node={child}
              depth={depth + 1}
              onDismiss={onDismiss}
              collapsedIds={collapsedIds}
              onToggleCollapse={onToggleCollapse}
              isLastChild={idx === node.children.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// ── Main component ───────────────────────────────────────────────────────────

export interface AgentTreeProps {
  sessions: AgentSession[];
  onDismiss: (id: string) => void;
}

export const AgentTree = memo(function AgentTree({
  sessions,
  onDismiss,
}: AgentTreeProps): React.ReactElement {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const handleToggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const roots = buildTree(sessions);

  return (
    <div>
      {roots.map((root, idx) => (
        <TreeNodeRenderer
          key={root.session.id}
          node={root}
          depth={0}
          onDismiss={onDismiss}
          collapsedIds={collapsedIds}
          onToggleCollapse={handleToggleCollapse}
          isLastChild={idx === roots.length - 1}
        />
      ))}
    </div>
  );
});
