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
  /** Worst diagnostic severity among children (4A) */
  diagnosticSeverity?: 'error' | 'warning' | 'info' | 'hint';
}

function DirectoryName({
  node,
  isEditing,
  editValue,
  onEditConfirm,
  onEditCancel,
  statusColor,
}: Pick<
  TreeItemDirectoryProps,
  'node' | 'isEditing' | 'editValue' | 'onEditConfirm' | 'onEditCancel' | 'statusColor'
>): React.ReactElement {
  if (isEditing && onEditConfirm && onEditCancel) {
    return (
      <InlineEditInput
        initialValue={editValue ?? node.name}
        onConfirm={onEditConfirm}
        onCancel={onEditCancel}
      />
    );
  }

  return <DirLabel name={node.name} statusColor={statusColor} />;
}

function DirectoryMeta({
  node,
  statusColor,
  statusLbl,
  isBookmarked,
  heatDot,
  heatLevel,
  diagnosticSeverity,
}: Pick<
  TreeItemDirectoryProps,
  'node' | 'statusColor' | 'statusLbl' | 'isBookmarked' | 'heatDot' | 'heatLevel' | 'diagnosticSeverity'
>): React.ReactElement {
  return (
    <>
      {!node.isExpanded && node.children !== undefined && (
        <ChildCount count={node.children.length} />
      )}
      {diagnosticSeverity && <DirDiagnosticIndicator severity={diagnosticSeverity} />}
      {statusLbl && <StatusBadge label={statusLbl} color={statusColor} />}
      {isBookmarked && <PinDot />}
      {heatDot && <HeatDot color={heatDot} glow={heatLevel === 'fire'} />}
    </>
  );
}

export function TreeItemDirectory({
  node,
  isEditing,
  editValue,
  onEditConfirm, onEditCancel,
  statusColor, statusLbl,
  isBookmarked, heatDot, heatLevel,
  diagnosticSeverity,
}: TreeItemDirectoryProps): React.ReactElement {
  return (
    <>
      <Chevron expanded={!!node.isExpanded} />
      <FolderTypeIcon name={node.name} open={!!node.isExpanded} />
      <DirectoryName
        node={node}
        isEditing={isEditing}
        editValue={editValue}
        onEditConfirm={onEditConfirm}
        onEditCancel={onEditCancel}
        statusColor={statusColor}
      />
      {!isEditing && (
        <DirectoryMeta
          node={node}
          statusColor={statusColor}
          statusLbl={statusLbl}
          isBookmarked={isBookmarked}
          heatDot={heatDot}
          heatLevel={heatLevel}
          diagnosticSeverity={diagnosticSeverity}
        />
      )}
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

// ─── Directory diagnostic indicator (4A) ─────────────────────────────────────

const DIR_DIAGNOSTIC_CONFIG: Record<string, { color: string; shape: 'circle' | 'triangle'; label: string }> = {
  error:   { color: '#ef4444', shape: 'circle',   label: 'Contains errors' },
  warning: { color: '#f59e0b', shape: 'triangle', label: 'Contains warnings' },
  info:    { color: '#3b82f6', shape: 'circle',   label: 'Contains info' },
  hint:    { color: '#6b7280', shape: 'circle',   label: 'Contains hints' },
};

function DirDiagnosticIndicator({ severity }: { severity: string }): React.ReactElement | null {
  const config = DIR_DIAGNOSTIC_CONFIG[severity];
  if (!config) return null;

  if (config.shape === 'triangle') {
    return (
      <svg
        width="8"
        height="8"
        viewBox="0 0 8 8"
        style={{ flexShrink: 0, marginLeft: '4px' }}
        aria-hidden="true"
        title={config.label}
      >
        <polygon points="4,1 7,7 1,7" fill={config.color} opacity={0.7} />
      </svg>
    );
  }

  return (
    <span
      aria-hidden="true"
      title={config.label}
      style={{
        flexShrink: 0,
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: config.color,
        marginLeft: '4px',
        opacity: 0.7,
      }}
    />
  );
}
