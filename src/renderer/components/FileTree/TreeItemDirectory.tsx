/**
 * TreeItemDirectory — renders the directory-specific content inside FileTreeItem.
 */

import React from 'react';
import { FolderTypeIcon } from './FileTypeIcon';
import { InlineEditInput } from './InlineEditInput';
import type { TreeNode } from './FileTreeItem';

export interface TreeItemDirectoryProps {
  node: TreeNode;
  isEditing: boolean;
  editValue?: string;
  onEditConfirm?: (newName: string) => void;
  onEditCancel?: () => void;
  statusColor?: string;
  statusLbl?: string;
  isBookmarked?: boolean;
  heatDot?: string;
  heatLevel?: string;
}

export function TreeItemDirectory({
  node, isEditing, editValue,
  onEditConfirm, onEditCancel,
  statusColor, statusLbl,
  isBookmarked, heatDot, heatLevel,
}: TreeItemDirectoryProps): React.ReactElement {
  return (
    <>
      <Chevron expanded={!!node.isExpanded} />
      <FolderTypeIcon name={node.name} open={!!node.isExpanded} />
      {isEditing && onEditConfirm && onEditCancel ? (
        <InlineEditInput initialValue={editValue ?? node.name} onConfirm={onEditConfirm} onCancel={onEditCancel} />
      ) : (
        <DirLabel name={node.name} statusColor={statusColor} />
      )}
      {!isEditing && !node.isExpanded && node.children !== undefined && (
        <ChildCount count={node.children.length} />
      )}
      {!isEditing && statusLbl && <StatusBadge label={statusLbl} color={statusColor} />}
      {!isEditing && isBookmarked && <PinDot />}
      {!isEditing && heatDot && <HeatDot color={heatDot} glow={heatLevel === 'fire'} />}
      {node.isLoading && <LoadingDots />}
    </>
  );
}

function Chevron({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 120ms ease', fill: 'var(--text-muted)' }}>
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DirLabel({ name, statusColor }: { name: string; statusColor?: string }): React.ReactElement {
  return (
    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8125rem', fontWeight: 500, color: statusColor ?? 'var(--text)', fontFamily: 'var(--font-ui)' }}>
      {name}
    </span>
  );
}

function ChildCount({ count }: { count: number }): React.ReactElement {
  return <span style={{ flexShrink: 0, fontSize: '0.6875rem', color: 'var(--text-faint)', marginLeft: '2px' }}>({count})</span>;
}

function StatusBadge({ label, color }: { label: string; color?: string }): React.ReactElement {
  return <span style={{ flexShrink: 0, fontSize: '0.625rem', fontWeight: 600, fontFamily: 'var(--font-mono)', color, marginLeft: '4px', lineHeight: 1 }}>{label}</span>;
}

function PinDot(): React.ReactElement {
  return <span title="Pinned" style={{ flexShrink: 0, fontSize: '0.625rem', color: 'var(--accent)', marginLeft: '4px', lineHeight: 1 }}>&#x25CF;</span>;
}

function HeatDot({ color, glow }: { color: string; glow: boolean }): React.ReactElement {
  return <span style={{ flexShrink: 0, width: '6px', height: '6px', borderRadius: '50%', backgroundColor: color, marginLeft: '4px', boxShadow: glow ? `0 0 4px ${color}` : undefined }} />;
}

function LoadingDots(): React.ReactElement {
  return <span style={{ fontSize: '0.6875rem', color: 'var(--text-faint)', flexShrink: 0 }}>...</span>;
}
