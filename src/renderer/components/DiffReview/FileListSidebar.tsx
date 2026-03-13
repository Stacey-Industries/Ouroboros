/**
 * FileListSidebar.tsx - Sidebar showing changed files in the diff review.
 *
 * Each file shows its status badge (M/A/D/R), relative path, and hunk
 * decision progress. Click to select and scroll to that file in the main panel.
 */

import React, { memo, useState, type CSSProperties } from 'react';
import type { ReviewFile } from './types';

interface FileListSidebarProps {
  files: ReviewFile[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onAcceptAll: (index: number) => void;
  onRejectAll: (index: number) => void;
}

interface FileListSidebarHeaderProps {
  count: number;
}

interface FileListItemProps {
  file: ReviewFile;
  index: number;
  isSelected: boolean;
  onAcceptAll: (index: number) => void;
  onRejectAll: (index: number) => void;
  onSelect: (index: number) => void;
}

interface FileListItemSummaryProps {
  allDecided: boolean;
  file: ReviewFile;
  progress: { decided: number; total: number };
}

interface QuickActionButtonProps {
  color: string;
  label: string;
  onClick: () => void;
}

const sidebarStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'auto',
  borderRight: '1px solid var(--border)',
  backgroundColor: 'var(--bg-secondary)',
  minWidth: '200px',
  maxWidth: '280px',
};

const headerStyle: CSSProperties = {
  padding: '6px 8px',
  fontSize: '0.6875rem',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid var(--border)',
  userSelect: 'none',
};

const fileItemSummaryStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

const filePathStyle: CSSProperties = {
  flex: 1,
  fontSize: '0.75rem',
  fontFamily: 'var(--font-mono)',
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  direction: 'rtl',
  textAlign: 'left',
};

const actionRowStyle: CSSProperties = {
  display: 'flex',
  gap: '4px',
  marginTop: '2px',
};

function statusBadge(status: ReviewFile['status']): { label: string; color: string } {
  switch (status) {
    case 'added': return { label: 'A', color: 'var(--success, #4CAF50)' };
    case 'deleted': return { label: 'D', color: 'var(--error, #f85149)' };
    case 'renamed': return { label: 'R', color: 'var(--accent, #58a6ff)' };
    default: return { label: 'M', color: 'var(--warning, #d29922)' };
  }
}

function hunkProgress(file: ReviewFile): { decided: number; total: number } {
  const total = file.hunks.length;
  const decided = file.hunks.filter((hunk) => hunk.decision !== 'pending').length;
  return { decided, total };
}

function fileItemStyle(isSelected: boolean, hovered: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '6px 8px',
    cursor: 'pointer',
    backgroundColor: isSelected ? 'rgba(88, 166, 255, 0.1)' : hovered ? 'rgba(255,255,255,0.03)' : 'transparent',
    borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
    borderBottom: '1px solid var(--border-muted)',
    transition: 'background-color 0.1s',
  };
}

function badgeStyle(color: string): CSSProperties {
  return {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    borderRadius: '3px',
    fontSize: '0.625rem',
    fontWeight: 700,
    color,
    border: `1px solid ${color}`,
  };
}

function progressStyle(allDecided: boolean): CSSProperties {
  return {
    flexShrink: 0,
    fontSize: '0.625rem',
    color: allDecided ? 'var(--success, #4CAF50)' : 'var(--text-faint)',
    fontWeight: 500,
  };
}

function actionButtonStyle(color: string): CSSProperties {
  return {
    padding: '1px 6px',
    fontSize: '0.5625rem',
    fontFamily: 'var(--font-ui)',
    border: `1px solid ${color}`,
    borderRadius: '3px',
    background: 'transparent',
    color,
    cursor: 'pointer',
  };
}

function FileListSidebarHeader({ count }: FileListSidebarHeaderProps): React.ReactElement {
  return <div style={headerStyle}>Changed Files ({count})</div>;
}

function FileListItemSummary({ allDecided, file, progress }: FileListItemSummaryProps): React.ReactElement {
  const badge = statusBadge(file.status);

  return (
    <div style={fileItemSummaryStyle}>
      <span style={badgeStyle(badge.color)}>{badge.label}</span>
      <span style={filePathStyle} title={file.relativePath}>{file.relativePath}</span>
      <span style={progressStyle(allDecided)}>{progress.decided}/{progress.total}</span>
    </div>
  );
}

function QuickActionButton({ color, label, onClick }: QuickActionButtonProps): React.ReactElement {
  return (
    <button onClick={(event) => { event.stopPropagation(); onClick(); }} style={actionButtonStyle(color)}>
      {label}
    </button>
  );
}

function FileListItemActions({
  index,
  onAcceptAll,
  onRejectAll,
}: Pick<FileListItemProps, 'index' | 'onAcceptAll' | 'onRejectAll'>): React.ReactElement {
  return (
    <div style={actionRowStyle}>
      <QuickActionButton color="var(--success, #4CAF50)" label="Accept All" onClick={() => onAcceptAll(index)} />
      <QuickActionButton color="var(--error, #f85149)" label="Reject All" onClick={() => onRejectAll(index)} />
    </div>
  );
}

function FileListItem({
  file,
  index,
  isSelected,
  onAcceptAll,
  onRejectAll,
  onSelect,
}: FileListItemProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const progress = hunkProgress(file);
  const allDecided = progress.decided === progress.total;

  return (
    <div
      onClick={() => onSelect(index)}
      style={fileItemStyle(isSelected, hovered)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <FileListItemSummary allDecided={allDecided} file={file} progress={progress} />
      {isSelected && !allDecided ? <FileListItemActions index={index} onAcceptAll={onAcceptAll} onRejectAll={onRejectAll} /> : null}
    </div>
  );
}

export const FileListSidebar = memo(function FileListSidebar({
  files,
  selectedIndex,
  onSelect,
  onAcceptAll,
  onRejectAll,
}: FileListSidebarProps): React.ReactElement {
  return (
    <div style={sidebarStyle}>
      <FileListSidebarHeader count={files.length} />
      {files.map((file, index) => (
        <FileListItem
          key={file.filePath}
          file={file}
          index={index}
          isSelected={index === selectedIndex}
          onSelect={onSelect}
          onAcceptAll={onAcceptAll}
          onRejectAll={onRejectAll}
        />
      ))}
    </div>
  );
});
