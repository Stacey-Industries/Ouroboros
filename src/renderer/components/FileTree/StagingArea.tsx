/**
 * StagingArea - collapsible git staging area shown at the top of the file tree.
 *
 * Displays two sub-sections:
 *   - "Staged Changes (N)" - files in the git index
 *   - "Changes (N)" - unstaged modifications + untracked files
 *
 * Each file shows status badge and hover action buttons (stage/unstage/discard).
 */

import React, { useState, useCallback } from 'react';
import type { DetailedGitStatus } from '../../hooks/useGitStatusDetailed';
import { FileTypeIcon } from './FileTypeIcon';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StagingFileEntry {
  path: string;
  name: string;
  status: string;
}

export interface StagingAreaProps {
  projectRoot: string;
  status: DetailedGitStatus;
  onRefresh: () => void;
  onFileSelect: (filePath: string) => void;
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const STAGING_CSS = `
  .staging-file-row:hover { background-color: var(--bg-tertiary); }
  .staging-file-row:hover .staging-action-btn { opacity: 1 !important; }
  .staging-action-btn:hover { color: var(--accent) !important; }
  .staging-discard-btn:hover { color: var(--error) !important; }
`;

// ─── Styles ───────────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--border-muted)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '4px 8px',
  gap: '4px',
  cursor: 'pointer',
  userSelect: 'none',
  borderBottom: '1px solid var(--border-muted)',
  minHeight: '26px',
};

const headerTitleStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const countBadgeStyle: React.CSSProperties = {
  flexShrink: 0,
  fontSize: '0.625rem',
  fontWeight: 600,
  padding: '0 5px',
  borderRadius: '8px',
  lineHeight: '16px',
};

const subHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '3px 8px 3px 12px',
  gap: '4px',
  cursor: 'pointer',
  userSelect: 'none',
  minHeight: '22px',
};

const subHeaderTitleStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '0.6875rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  paddingLeft: '24px',
  paddingRight: '8px',
  cursor: 'pointer',
  height: '26px',
  boxSizing: 'border-box',
  userSelect: 'none',
};

const fileNameStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-mono)',
};

const actionBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  background: 'none',
  border: 'none',
  padding: '1px 3px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  borderRadius: '3px',
  opacity: 0,
  transition: 'opacity 150ms',
  fontSize: '0.75rem',
  fontWeight: 700,
  lineHeight: 1,
};

const headerActionBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  background: 'none',
  border: 'none',
  padding: '1px 4px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  borderRadius: '3px',
  fontSize: '0.625rem',
  fontWeight: 600,
  letterSpacing: '0.02em',
  transition: 'color 150ms',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFileName(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? filePath;
}

function statusColor(status: string): string {
  switch (status) {
    case 'M': return 'var(--warning, #e5a50a)';
    case 'A': return 'var(--success, #3fb950)';
    case 'D': return 'var(--error, #f85149)';
    case '?': return 'var(--text-faint)';
    case 'R': return 'var(--info, #58a6ff)';
    default: return 'var(--text-faint)';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'M': return 'Modified';
    case 'A': return 'Added';
    case 'D': return 'Deleted';
    case '?': return 'Untracked';
    case 'R': return 'Renamed';
    default: return status;
  }
}

function toEntries(map: Map<string, string>): StagingFileEntry[] {
  const entries: StagingFileEntry[] = [];
  for (const [path, status] of map) {
    entries.push({ path, name: getFileName(path), status });
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Chevron({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"
      className="text-text-semantic-faint" style={{ flexShrink: 0, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}
    >
      <path d="M3 2L7 5L3 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GitIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="text-interactive-accent" style={{ flexShrink: 0 }}>
      <path d="M14.5 7.5L8.5 1.5a.7.7 0 0 0-1 0L5.7 3.3l1.3 1.3a1 1 0 0 1 1.2 1.2l1.2 1.2a1 1 0 1 1-.7.7L7.6 6.5v3a1 1 0 1 1-1-.6V6.3a1 1 0 0 1-.5-1.3L4.8 3.7 1.5 7a.7.7 0 0 0 0 1L7.5 14a.7.7 0 0 0 1 0l6-6a.7.7 0 0 0 0-1z" stroke="currentColor" strokeWidth="0.8" fill="none" />
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

function StagingFileRow({
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
      <span style={fileNameStyle} className="text-text-semantic-secondary">{entry.path}</span>
      <StatusBadge status={entry.status} />
      {actions}
    </div>
  );
}

function StageButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      className="staging-action-btn text-text-semantic-faint"
      style={actionBtnStyle}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title="Stage file"
      aria-label="Stage file"
    >
      +
    </button>
  );
}

function UnstageButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      className="staging-action-btn text-text-semantic-faint"
      style={actionBtnStyle}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title="Unstage file"
      aria-label="Unstage file"
    >
      -
    </button>
  );
}

function DiscardButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      className="staging-action-btn staging-discard-btn text-text-semantic-faint"
      style={actionBtnStyle}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title="Discard changes"
      aria-label="Discard changes"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M2 3h6M3.5 3V2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5V3M7 3v4.5a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5V3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function SubSectionHeader({
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
    <div style={subHeaderStyle} onClick={onToggle} role="button" tabIndex={0} aria-expanded={expanded}>
      <Chevron expanded={expanded} />
      <span style={subHeaderTitleStyle} className="text-text-semantic-faint">{title} ({count})</span>
      {headerAction}
    </div>
  );
}

// ─── Staged sub-section ───────────────────────────────────────────────────────

function StagedSection({
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

  const handleUnstage = useCallback(async (filePath: string) => {
    await window.electronAPI.git.unstage(projectRoot, filePath);
    onRefresh();
  }, [projectRoot, onRefresh]);

  const handleUnstageAll = useCallback(async () => {
    await window.electronAPI.git.unstageAll(projectRoot);
    onRefresh();
  }, [projectRoot, onRefresh]);

  if (entries.length === 0) return <></>;

  return (
    <div>
      <SubSectionHeader
        title="Staged Changes"
        count={entries.length}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        headerAction={
          <button
            style={headerActionBtnStyle}
            className="text-text-semantic-faint"
            onClick={(e) => { e.stopPropagation(); void handleUnstageAll(); }}
            title="Unstage all"
            aria-label="Unstage all"
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)'; }}
          >
            -All
          </button>
        }
      />
      {expanded && (
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
      )}
    </div>
  );
}

// ─── Unstaged sub-section ─────────────────────────────────────────────────────

function UnstagedSection({
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

  const handleStage = useCallback(async (filePath: string) => {
    await window.electronAPI.git.stage(projectRoot, filePath);
    onRefresh();
  }, [projectRoot, onRefresh]);

  const handleDiscard = useCallback(async (filePath: string) => {
    // eslint-disable-next-line no-restricted-globals
    const confirmed = confirm(`Discard changes to "${filePath}"? This cannot be undone.`);
    if (!confirmed) return;
    await window.electronAPI.git.discardFile(projectRoot, filePath);
    onRefresh();
  }, [projectRoot, onRefresh]);

  const handleStageAll = useCallback(async () => {
    await window.electronAPI.git.stageAll(projectRoot);
    onRefresh();
  }, [projectRoot, onRefresh]);

  if (entries.length === 0) return <></>;

  return (
    <div>
      <SubSectionHeader
        title="Changes"
        count={entries.length}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        headerAction={
          <button
            style={headerActionBtnStyle}
            className="text-text-semantic-faint"
            onClick={(e) => { e.stopPropagation(); void handleStageAll(); }}
            title="Stage all"
            aria-label="Stage all"
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)'; }}
          >
            +All
          </button>
        }
      />
      {expanded && (
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
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StagingArea({
  projectRoot,
  status,
  onRefresh,
  onFileSelect,
}: StagingAreaProps): React.ReactElement | null {
  const [isExpanded, setIsExpanded] = useState(false);

  const stagedEntries = toEntries(status.staged);
  const unstagedEntries = toEntries(status.unstaged);
  const totalCount = stagedEntries.length + unstagedEntries.length;

  if (totalCount === 0) return null;

  return (
    <div style={sectionStyle}>
      <style>{STAGING_CSS}</style>
      <div
        className="bg-surface-raised"
        style={headerStyle}
        onClick={() => setIsExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsExpanded((v) => !v); } }}
        aria-expanded={isExpanded}
        aria-label="Toggle Source Control section"
      >
        <Chevron expanded={isExpanded} />
        <GitIcon />
        <span className="text-text-semantic-muted" style={headerTitleStyle}>Source Control</span>
        <span className="text-text-semantic-faint bg-surface-base" style={countBadgeStyle}>{totalCount}</span>
      </div>
      {isExpanded && (
        <>
          <StagedSection
            entries={stagedEntries}
            projectRoot={projectRoot}
            onRefresh={onRefresh}
            onFileSelect={onFileSelect}
          />
          <UnstagedSection
            entries={unstagedEntries}
            projectRoot={projectRoot}
            onRefresh={onRefresh}
            onFileSelect={onFileSelect}
          />
        </>
      )}
    </div>
  );
}
