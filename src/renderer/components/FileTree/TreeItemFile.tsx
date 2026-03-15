/**
 * TreeItemFile — renders the file-specific content inside FileTreeItem.
 */

import React from 'react';
import { FileTypeIcon } from './FileTypeIcon';
import { InlineEditInput } from './InlineEditInput';
import type { TreeNode, MatchRange } from './FileTreeItem';

export interface TreeItemFileProps {
  node: TreeNode;
  isEditing: boolean;
  editValue?: string;
  onEditConfirm?: (newName: string) => void;
  onEditCancel?: () => void;
  statusColor?: string;
  statusLbl?: string;
  searchMode?: boolean;
  matchRanges?: MatchRange[];
  heatDot?: string;
  heatLevel?: string;
  /** Diagnostic severity for this file (4A) */
  diagnosticSeverity?: 'error' | 'warning' | 'info' | 'hint';
  /** Whether this file has unsaved changes (4C) */
  isDirty?: boolean;
}

function FileName({
  node,
  isEditing,
  editValue,
  onEditConfirm,
  onEditCancel,
  statusColor,
  matchRanges,
}: Pick<
  TreeItemFileProps,
  'node' | 'isEditing' | 'editValue' | 'onEditConfirm' | 'onEditCancel' | 'statusColor' | 'matchRanges'
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

  return (
    <FileLabel
      name={node.name}
      statusColor={statusColor}
      matchRanges={matchRanges}
    />
  );
}

function FileMeta({
  node,
  statusColor,
  statusLbl,
  searchMode,
  heatDot,
  heatLevel,
  diagnosticSeverity,
  isDirty,
}: Pick<
  TreeItemFileProps,
  'node' | 'statusColor' | 'statusLbl' | 'searchMode' | 'heatDot' | 'heatLevel' | 'diagnosticSeverity' | 'isDirty'
>): React.ReactElement {
  return (
    <>
      {isDirty && <DirtyDot />}
      {diagnosticSeverity && <DiagnosticIndicator severity={diagnosticSeverity} />}
      {statusLbl && <StatusBadge label={statusLbl} color={statusColor} />}
      {searchMode && <SearchPath relativePath={node.relativePath} />}
      {heatDot && <HeatDot color={heatDot} glow={heatLevel === 'fire'} />}
    </>
  );
}

export function TreeItemFile({
  node,
  isEditing,
  editValue,
  onEditConfirm, onEditCancel,
  statusColor, statusLbl,
  searchMode, matchRanges,
  heatDot, heatLevel,
  diagnosticSeverity, isDirty,
}: TreeItemFileProps): React.ReactElement {
  return (
    <>
      {node.hasNestedChildren ? (
        <NestChevron expanded={!!node.isNestExpanded} />
      ) : (
        <span style={{ width: '16px', flexShrink: 0 }} />
      )}
      <FileTypeIcon filename={node.name} />
      <FileName
        node={node}
        isEditing={isEditing}
        editValue={editValue}
        onEditConfirm={onEditConfirm}
        onEditCancel={onEditCancel}
        statusColor={statusColor}
        matchRanges={matchRanges}
      />
      {!isEditing && (
        <FileMeta
          node={node}
          statusColor={statusColor}
          statusLbl={statusLbl}
          searchMode={searchMode}
          heatDot={heatDot}
          heatLevel={heatLevel}
          diagnosticSeverity={diagnosticSeverity}
          isDirty={isDirty}
        />
      )}
    </>
  );
}

function FileLabel({ name, statusColor, matchRanges }: {
  name: string; statusColor?: string; matchRanges?: MatchRange[];
}): React.ReactElement {
  return (
    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8125rem', color: statusColor ?? 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
      <HighlightedName name={name} ranges={matchRanges} />
    </span>
  );
}

function HighlightedName({ name, ranges }: { name: string; ranges?: MatchRange[] }): React.ReactElement {
  if (!ranges || ranges.length === 0) return <span>{name}</span>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (cursor < range.start) {
      parts.push(<span key={`p-${cursor}`}>{name.slice(cursor, range.start)}</span>);
    }
    parts.push(<span key={`m-${range.start}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>{name.slice(range.start, range.end)}</span>);
    cursor = range.end;
  }
  if (cursor < name.length) {
    parts.push(<span key="end">{name.slice(cursor)}</span>);
  }
  return <>{parts}</>;
}

function StatusBadge({ label, color }: { label: string; color?: string }): React.ReactElement {
  return <span style={{ flexShrink: 0, fontSize: '0.625rem', fontWeight: 600, fontFamily: 'var(--font-mono)', color, marginLeft: '4px', lineHeight: 1 }}>{label}</span>;
}

function SearchPath({ relativePath }: { relativePath: string }): React.ReactElement | null {
  if (!relativePath.includes('/')) return null;
  return (
    <span style={{ flexShrink: 0, fontSize: '0.6875rem', color: 'var(--text-faint)', marginLeft: '4px', maxWidth: '40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {relativePath.slice(0, relativePath.lastIndexOf('/'))}
    </span>
  );
}

function HeatDot({ color, glow }: { color: string; glow: boolean }): React.ReactElement {
  return <span style={{ flexShrink: 0, width: '6px', height: '6px', borderRadius: '50%', backgroundColor: color, marginLeft: '4px', boxShadow: glow ? `0 0 4px ${color}` : undefined }} />;
}

// ─── Nesting chevron (4B) ────────────────────────────────────────────────────

function NestChevron({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      style={{
        flexShrink: 0,
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 120ms ease',
        fill: 'var(--text-muted)',
        opacity: 0.6,
      }}
    >
      <path
        d="M6 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Diagnostic indicator (4A) ───────────────────────────────────────────────

const DIAGNOSTIC_CONFIG: Record<string, { color: string; shape: 'circle' | 'triangle'; label: string }> = {
  error:   { color: '#ef4444', shape: 'circle',   label: 'Error' },
  warning: { color: '#f59e0b', shape: 'triangle', label: 'Warning' },
  info:    { color: '#3b82f6', shape: 'circle',   label: 'Info' },
  hint:    { color: '#6b7280', shape: 'circle',   label: 'Hint' },
};

function DiagnosticIndicator({ severity }: { severity: string }): React.ReactElement | null {
  const config = DIAGNOSTIC_CONFIG[severity];
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
        <polygon points="4,1 7,7 1,7" fill={config.color} />
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
      }}
    />
  );
}

// ─── Dirty indicator (4C) ────────────────────────────────────────────────────

function DirtyDot(): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      title="Unsaved changes"
      style={{
        flexShrink: 0,
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: '#f59e0b',
        marginLeft: '4px',
      }}
    />
  );
}
