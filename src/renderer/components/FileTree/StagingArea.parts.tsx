/**
 * StagingArea.parts.tsx — StagedSection and UnstagedSection sub-components,
 * plus shared icon/row primitives used by StagingArea.tsx.
 */

import React, { useCallback, useState } from 'react';

import { FileTypeIcon } from './FileTypeIcon';
import {
  actionBtnStyle,
  fileNameStyle,
  headerActionBtnStyle,
  rowStyle,
  subHeaderStyle,
  subHeaderTitleStyle,
} from './StagingArea.styles';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StagingFileEntry {
  path: string;
  name: string;
  status: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case 'M':
      return 'var(--warning, #e5a50a)';
    case 'A':
      return 'var(--status-success)';
    case 'D':
      return 'var(--status-error)';
    case '?':
      return 'var(--text-faint)';
    case 'R':
      return 'var(--info, #58a6ff)';
    default:
      return 'var(--text-faint)';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'M':
      return 'Modified';
    case 'A':
      return 'Added';
    case 'D':
      return 'Deleted';
    case '?':
      return 'Untracked';
    case 'R':
      return 'Renamed';
    default:
      return status;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

export function Chevron({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className="text-text-semantic-faint"
      style={{
        flexShrink: 0,
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 150ms',
      }}
    >
      <path
        d="M3 2L7 5L3 8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusBadge({ status }: { status: string }): React.ReactElement {
  return (
    <span
      title={statusLabel(status)}
      style={{
        flexShrink: 0,
        fontSize: '0.625rem',
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        color: statusColor(status),
        width: '14px',
        textAlign: 'center',
        lineHeight: 1,
      }}
    >
      {status}
    </span>
  );
}

export function StagingFileRow({
  entry,
  projectRoot,
  actions,
  onFileSelect,
}: {
  entry: StagingFileEntry;
  projectRoot: string;
  actions: React.ReactNode;
  onFileSelect: (filePath: string) => void;
}): React.ReactElement {
  const sep = projectRoot.includes('/') ? '/' : '\\';
  const absolutePath = `${projectRoot}${sep}${entry.path.replace(/\//g, sep)}`;
  return (
    <div
      className="staging-file-row"
      style={rowStyle}
      onClick={() => onFileSelect(absolutePath)}
      title={entry.path}
      role="listitem"
    >
      <FileTypeIcon filename={entry.name} />
      <span style={fileNameStyle} className="text-text-semantic-secondary">
        {entry.path}
      </span>
      <StatusBadge status={entry.status} />
      {actions}
    </div>
  );
}

export function StageButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      className="staging-action-btn text-text-semantic-faint"
      style={actionBtnStyle}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Stage file"
      aria-label="Stage file"
    >
      +
    </button>
  );
}

export function UnstageButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      className="staging-action-btn text-text-semantic-faint"
      style={actionBtnStyle}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Unstage file"
      aria-label="Unstage file"
    >
      -
    </button>
  );
}

export function DiscardButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      className="staging-action-btn staging-discard-btn text-text-semantic-faint"
      style={actionBtnStyle}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Discard changes"
      aria-label="Discard changes"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path
          d="M2 3h6M3.5 3V2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5V3M7 3v4.5a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5V3"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

export function SubSectionHeader({
  title,
  count,
  expanded,
  onToggle,
  headerAction,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  headerAction?: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      style={subHeaderStyle}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
    >
      <Chevron expanded={expanded} />
      <span style={subHeaderTitleStyle} className="text-text-semantic-faint">
        {title} ({count})
      </span>
      {headerAction}
    </div>
  );
}

export function BulkActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      style={headerActionBtnStyle}
      className="text-text-semantic-faint"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--interactive-accent)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)';
      }}
    >
      {label}
    </button>
  );
}

// ─── Staged section ───────────────────────────────────────────────────────────

function useStagedActions(projectRoot: string, onRefresh: () => void) {
  const handleUnstage = useCallback(
    async (filePath: string) => {
      await window.electronAPI.git.unstage(projectRoot, filePath);
      onRefresh();
    },
    [projectRoot, onRefresh],
  );
  const handleUnstageAll = useCallback(async () => {
    await window.electronAPI.git.unstageAll(projectRoot);
    onRefresh();
  }, [projectRoot, onRefresh]);
  return { handleUnstage, handleUnstageAll };
}

function StagedFileList({
  entries,
  projectRoot,
  onFileSelect,
  handleUnstage,
}: {
  entries: StagingFileEntry[];
  projectRoot: string;
  onFileSelect: (filePath: string) => void;
  handleUnstage: (filePath: string) => Promise<void>;
}): React.ReactElement {
  return (
    <div role="list" aria-label="Staged files">
      {entries.map((entry) => (
        <StagingFileRow
          key={entry.path}
          entry={entry}
          projectRoot={projectRoot}
          onFileSelect={onFileSelect}
          actions={<UnstageButton onClick={() => void handleUnstage(entry.path)} />}
        />
      ))}
    </div>
  );
}

export function StagedSection({
  entries,
  projectRoot,
  onRefresh,
  onFileSelect,
}: {
  entries: StagingFileEntry[];
  projectRoot: string;
  onRefresh: () => void;
  onFileSelect: (filePath: string) => void;
}): React.ReactElement {
  const [expanded, setExpanded] = useState(true);
  const { handleUnstage, handleUnstageAll } = useStagedActions(projectRoot, onRefresh);

  if (entries.length === 0) return <></>;

  return (
    <div>
      <SubSectionHeader
        title="Staged Changes"
        count={entries.length}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        headerAction={<BulkActionButton label="-All" onClick={() => void handleUnstageAll()} />}
      />
      {expanded && (
        <StagedFileList
          entries={entries}
          projectRoot={projectRoot}
          onFileSelect={onFileSelect}
          handleUnstage={handleUnstage}
        />
      )}
    </div>
  );
}

// ─── Unstaged section ─────────────────────────────────────────────────────────

function useUnstagedActions(projectRoot: string, onRefresh: () => void) {
  const handleStage = useCallback(
    async (filePath: string) => {
      await window.electronAPI.git.stage(projectRoot, filePath);
      onRefresh();
    },
    [projectRoot, onRefresh],
  );
  const handleDiscard = useCallback(
    async (filePath: string) => {
      if (!confirm(`Discard changes to "${filePath}"? This cannot be undone.`)) return;
      await window.electronAPI.git.discardFile(projectRoot, filePath);
      onRefresh();
    },
    [projectRoot, onRefresh],
  );
  const handleStageAll = useCallback(async () => {
    await window.electronAPI.git.stageAll(projectRoot);
    onRefresh();
  }, [projectRoot, onRefresh]);
  return { handleStage, handleDiscard, handleStageAll };
}

function UnstagedFileList({
  entries,
  projectRoot,
  onFileSelect,
  handleStage,
  handleDiscard,
}: {
  entries: StagingFileEntry[];
  projectRoot: string;
  onFileSelect: (filePath: string) => void;
  handleStage: (filePath: string) => Promise<void>;
  handleDiscard: (filePath: string) => Promise<void>;
}): React.ReactElement {
  return (
    <div role="list" aria-label="Unstaged files">
      {entries.map((entry) => (
        <StagingFileRow
          key={entry.path}
          entry={entry}
          projectRoot={projectRoot}
          onFileSelect={onFileSelect}
          actions={
            <>
              <StageButton onClick={() => void handleStage(entry.path)} />
              <DiscardButton onClick={() => void handleDiscard(entry.path)} />
            </>
          }
        />
      ))}
    </div>
  );
}

export function UnstagedSection({
  entries,
  projectRoot,
  onRefresh,
  onFileSelect,
}: {
  entries: StagingFileEntry[];
  projectRoot: string;
  onRefresh: () => void;
  onFileSelect: (filePath: string) => void;
}): React.ReactElement {
  const [expanded, setExpanded] = useState(true);
  const { handleStage, handleDiscard, handleStageAll } = useUnstagedActions(projectRoot, onRefresh);

  if (entries.length === 0) return <></>;

  return (
    <div>
      <SubSectionHeader
        title="Changes"
        count={entries.length}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        headerAction={<BulkActionButton label="+All" onClick={() => void handleStageAll()} />}
      />
      {expanded && (
        <UnstagedFileList
          entries={entries}
          projectRoot={projectRoot}
          onFileSelect={onFileSelect}
          handleStage={handleStage}
          handleDiscard={handleDiscard}
        />
      )}
    </div>
  );
}
