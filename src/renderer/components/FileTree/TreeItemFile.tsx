/**
 * TreeItemFile — renders the file-specific content inside FileTreeItem.
 */

import React from 'react';

import type { MatchRange, TreeNode } from './FileTreeItem';
import { FileTypeIcon } from './FileTypeIcon';
import { InlineEditInput } from './InlineEditInput';
import {
  DiagnosticIndicator,
  DirtyDot,
  HeatDot,
  HighlightedName,
  NestChevron,
  SearchPath,
  StatusBadge,
} from './TreeItemFile.parts';

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

function FileLabel({
  name,
  statusColor,
  matchRanges,
}: {
  name: string;
  statusColor?: string;
  matchRanges?: MatchRange[];
}): React.ReactElement {
  return (
    <span
      className="text-text-semantic-muted"
      style={{
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontSize: '0.8125rem',
        color: statusColor ?? undefined,
        fontFamily: 'var(--font-mono)',
      }}
    >
      <HighlightedName name={name} ranges={matchRanges} />
    </span>
  );
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
  | 'node'
  | 'isEditing'
  | 'editValue'
  | 'onEditConfirm'
  | 'onEditCancel'
  | 'statusColor'
  | 'matchRanges'
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
  return <FileLabel name={node.name} statusColor={statusColor} matchRanges={matchRanges} />;
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
  | 'node'
  | 'statusColor'
  | 'statusLbl'
  | 'searchMode'
  | 'heatDot'
  | 'heatLevel'
  | 'diagnosticSeverity'
  | 'isDirty'
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

function FileNestIndicator({ node }: { node: TreeNode }): React.ReactElement {
  if (node.hasNestedChildren) return <NestChevron expanded={!!node.isNestExpanded} />;
  return <span style={{ width: '16px', flexShrink: 0 }} />;
}

export function TreeItemFile(props: TreeItemFileProps): React.ReactElement {
  const {
    node, isEditing, editValue, onEditConfirm, onEditCancel,
    statusColor, statusLbl, searchMode, matchRanges,
    heatDot, heatLevel, diagnosticSeverity, isDirty,
  } = props;
  return (
    <>
      <FileNestIndicator node={node} />
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
