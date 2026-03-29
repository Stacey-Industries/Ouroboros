/**
 * AgentTree.tsx - Tree view for parent-child agent relationships.
 * Root agents at top level; children indented with connecting lines.
 * Each node renders an AgentCard. Branches are collapsible.
 */

import React, { memo, useCallback, useState } from 'react';

import { AgentCard } from './AgentCard';
import type { AgentSession } from './types';

interface TreeNode {
  session: AgentSession;
  children: TreeNode[];
}

const INDENT_PX = 16;

const branchToggleStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
};
const guideContainerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: 0,
  pointerEvents: 'none',
};
const branchContainerStyle: React.CSSProperties = {
  paddingLeft: '8px',
  borderBottom: '1px solid var(--border-subtle)',
};

function buildTree(sessions: AgentSession[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const sessionIds = new Set(sessions.map((session) => session.id));

  for (const session of sessions) {
    nodeMap.set(session.id, { session, children: [] });
  }

  return sessions.reduce<TreeNode[]>((roots, session) => {
    const node = nodeMap.get(session.id)!;
    const parentId = session.parentSessionId;
    if (parentId && sessionIds.has(parentId)) nodeMap.get(parentId)!.children.push(node);
    else roots.push(node);
    return roots;
  }, []);
}

function getGuideStyle(
  depthIndex: number,
  depth: number,
  truncateLastGuide: boolean,
): React.CSSProperties {
  return {
    position: 'absolute',
    left: `${depthIndex * INDENT_PX + 8}px`,
    top: 0,
    bottom: depthIndex === depth - 1 && truncateLastGuide ? '50%' : 0,
    width: '1px',
    backgroundColor: 'var(--border-subtle)',
    opacity: 0.5,
  };
}

function getConnectorStyle(depth: number): React.CSSProperties {
  return {
    position: 'absolute',
    left: `${(depth - 1) * INDENT_PX + 8}px`,
    top: '18px',
    width: `${INDENT_PX - 4}px`,
    height: '1px',
    backgroundColor: 'var(--border-subtle)',
    opacity: 0.5,
  };
}

function setBranchToggleHover(target: HTMLButtonElement, hovered: boolean): void {
  target.style.color = hovered ? 'var(--text-muted)' : 'var(--text-faint)';
  target.style.background = hovered ? 'var(--surface-raised)' : 'transparent';
}

function getBranchLabel(childCount: number): string {
  return `${childCount} subagent${childCount !== 1 ? 's' : ''}`;
}

export function hasTreeStructure(sessions: AgentSession[]): boolean {
  const ids = new Set(sessions.map((session) => session.id));
  return sessions.some((session) => session.parentSessionId && ids.has(session.parentSessionId));
}

interface BranchToggleProps {
  expanded: boolean;
  childCount: number;
  onToggle: () => void;
}

const BranchToggle = memo(function BranchToggle({
  expanded,
  childCount,
  onToggle,
}: BranchToggleProps): React.ReactElement<any> {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors text-text-semantic-faint"
      style={branchToggleStyle}
      onMouseEnter={(event) => setBranchToggleHover(event.currentTarget, true)}
      onMouseLeave={(event) => setBranchToggleHover(event.currentTarget, false)}
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
      <span>{getBranchLabel(childCount)}</span>
    </button>
  );
});

interface TreeNodeRendererProps {
  node: TreeNode;
  depth: number;
  onDismiss: (id: string) => void;
  collapsedIds: Set<string>;
  onToggleCollapse: (id: string) => void;
  isLastChild: boolean;
}

function TreeGuides({
  depth,
  hasChildren,
  isLastChild,
}: {
  depth: number;
  hasChildren: boolean;
  isLastChild: boolean;
}): React.ReactElement<any> | null {
  if (depth === 0) return null;

  return (
    <div style={guideContainerStyle}>
      {Array.from({ length: depth }, (_, index) => (
        <span
          key={`guide-${index}`}
          style={getGuideStyle(index, depth, isLastChild && !hasChildren)}
        />
      ))}
      <span style={getConnectorStyle(depth)} />
    </div>
  );
}

function TreeNodeContent({
  childCount,
  indent,
  isCollapsed,
  onDismiss,
  onToggle,
  session,
}: {
  childCount: number;
  indent: number;
  isCollapsed: boolean;
  onDismiss: (id: string) => void;
  onToggle: () => void;
  session: AgentSession;
}): React.ReactElement<any> {
  return (
    <div style={{ paddingLeft: `${indent}px` }}>
      <AgentCard session={session} onDismiss={onDismiss} childCount={childCount} />
      {childCount > 0 && (
        <div className="flex items-center" style={branchContainerStyle}>
          <BranchToggle expanded={!isCollapsed} childCount={childCount} onToggle={onToggle} />
        </div>
      )}
    </div>
  );
}

function TreeChildren({
  nodes,
  depth,
  onDismiss,
  collapsedIds,
  onToggleCollapse,
}: {
  nodes: TreeNode[];
  depth: number;
  onDismiss: (id: string) => void;
  collapsedIds: Set<string>;
  onToggleCollapse: (id: string) => void;
}): React.ReactElement<any> {
  return (
    <div>
      {nodes.map((child, index) => (
        <TreeNodeRenderer
          key={child.session.id}
          node={child}
          depth={depth + 1}
          onDismiss={onDismiss}
          collapsedIds={collapsedIds}
          onToggleCollapse={onToggleCollapse}
          isLastChild={index === nodes.length - 1}
        />
      ))}
    </div>
  );
}

const TreeNodeRenderer = memo(function TreeNodeRenderer({
  node,
  depth,
  onDismiss,
  collapsedIds,
  onToggleCollapse,
  isLastChild,
}: TreeNodeRendererProps): React.ReactElement<any> {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsedIds.has(node.session.id);

  return (
    <div className="relative">
      <TreeGuides depth={depth} hasChildren={hasChildren} isLastChild={isLastChild} />
      <TreeNodeContent
        childCount={node.children.length}
        indent={depth * INDENT_PX}
        isCollapsed={isCollapsed}
        onDismiss={onDismiss}
        onToggle={() => onToggleCollapse(node.session.id)}
        session={node.session}
      />
      {hasChildren && !isCollapsed && (
        <TreeChildren
          nodes={node.children}
          depth={depth}
          onDismiss={onDismiss}
          collapsedIds={collapsedIds}
          onToggleCollapse={onToggleCollapse}
        />
      )}
    </div>
  );
});

export interface AgentTreeProps {
  sessions: AgentSession[];
  onDismiss: (id: string) => void;
}

export const AgentTree = memo(function AgentTree({
  sessions,
  onDismiss,
}: AgentTreeProps): React.ReactElement<any> {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const roots = buildTree(sessions);

  const handleToggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div>
      {roots.map((root, index) => (
        <TreeNodeRenderer
          key={root.session.id}
          node={root}
          depth={0}
          onDismiss={onDismiss}
          collapsedIds={collapsedIds}
          onToggleCollapse={handleToggleCollapse}
          isLastChild={index === roots.length - 1}
        />
      ))}
    </div>
  );
});
