import React, { useState } from 'react';
import type { ReviewFile } from './types';
import { FileListSidebar } from './FileListSidebar';
import { HunkView } from './HunkView';
import type { DiffReviewStats } from './DiffReviewPanelState';
interface DiffReviewLayoutProps {
  files: ReviewFile[];
  selectedFileIdx: number;
  stats: DiffReviewStats;
  onClose: () => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onAcceptAllFile: (fileIdx: number) => void;
  onRejectAllFile: (fileIdx: number) => void;
  onSelectFile: (idx: number) => void;
  onAcceptHunk: (fileIdx: number, hunkIdx: number) => void;
  onRejectHunk: (fileIdx: number, hunkIdx: number) => void;
  setFileRef: (idx: number, element: HTMLDivElement | null) => void;
}
const panelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundColor: 'var(--surface-base)' };
const headerStyle: React.CSSProperties = { flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--surface-panel)', fontSize: '0.8125rem', fontFamily: 'var(--font-ui)', userSelect: 'none' };
export function DiffReviewLayout({
  files,
  selectedFileIdx,
  stats,
  onClose,
  onAcceptAll,
  onRejectAll,
  onAcceptAllFile,
  onRejectAllFile,
  onSelectFile,
  onAcceptHunk,
  onRejectHunk,
  setFileRef,
}: DiffReviewLayoutProps): React.ReactElement {
  return (
    <div style={panelStyle}>
      <DiffReviewHeader
        stats={stats}
        allDecided={stats.decidedHunks === stats.totalHunks}
        onAcceptAll={onAcceptAll}
        onRejectAll={onRejectAll}
        onClose={onClose}
      />
      <DiffReviewBody
        files={files}
        selectedFileIdx={selectedFileIdx}
        onAcceptAllFile={onAcceptAllFile}
        onRejectAllFile={onRejectAllFile}
        onSelectFile={onSelectFile}
        onAcceptHunk={onAcceptHunk}
        onRejectHunk={onRejectHunk}
        setFileRef={setFileRef}
      />
    </div>
  );
}

function DiffReviewBody({
  files,
  selectedFileIdx,
  onAcceptAllFile,
  onRejectAllFile,
  onSelectFile,
  onAcceptHunk,
  onRejectHunk,
  setFileRef,
}: Omit<DiffReviewLayoutProps, 'stats' | 'onClose' | 'onAcceptAll' | 'onRejectAll'>): React.ReactElement {
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <FileListSidebar
        files={files}
        selectedIndex={selectedFileIdx}
        onSelect={onSelectFile}
        onAcceptAll={onAcceptAllFile}
        onRejectAll={onRejectAllFile}
      />
      <div style={{ flex: 1, overflow: 'auto' }}>
        {files.map((file, fileIdx) => (
          <FileSection
            key={file.filePath}
            ref={(element) => setFileRef(fileIdx, element)}
            file={file}
            fileIdx={fileIdx}
            isSelected={fileIdx === selectedFileIdx}
            onAcceptHunk={onAcceptHunk}
            onRejectHunk={onRejectHunk}
          />
        ))}
      </div>
    </div>
  );
}

function DiffReviewHeader({
  stats,
  allDecided,
  onAcceptAll,
  onRejectAll,
  onClose,
}: {
  stats: DiffReviewStats;
  allDecided: boolean;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onClose: () => void;
}): React.ReactElement {
  return (
    <div style={headerStyle}>
      <DiffReviewHeaderStats stats={stats} />
      <DiffReviewHeaderActions
        allDecided={allDecided}
        onAcceptAll={onAcceptAll}
        onRejectAll={onRejectAll}
        onClose={onClose}
      />
    </div>
  );
}

function DiffReviewHeaderStats({ stats }: { stats: DiffReviewStats }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Diff Review</span>
      <span style={{ color: 'var(--status-success, #4CAF50)' }}>+{stats.added}</span>
      <span style={{ color: 'var(--status-error, #f85149)' }}>-{stats.removed}</span>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
        {stats.decidedHunks}/{stats.totalHunks} hunks decided
      </span>
      <ReviewStat count={stats.acceptedHunks} color="var(--status-success, #4CAF50)" label="accepted" />
      <ReviewStat count={stats.rejectedHunks} color="var(--status-error, #f85149)" label="rejected" />
    </div>
  );
}

function DiffReviewHeaderActions({
  allDecided,
  onAcceptAll,
  onRejectAll,
  onClose,
}: {
  allDecided: boolean;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onClose: () => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      {!allDecided && (
        <>
          <HeaderBtn label="Accept All" color="var(--status-success, #4CAF50)" onClick={onAcceptAll} />
          <HeaderBtn label="Reject All" color="var(--status-error, #f85149)" onClick={onRejectAll} />
        </>
      )}
      <HeaderBtn label={allDecided ? 'Done' : 'Close'} color="var(--interactive-accent, #58a6ff)" onClick={onClose} />
    </div>
  );
}

function ReviewStat({
  count,
  color,
  label,
}: {
  count: number;
  color: string;
  label: string;
}): React.ReactElement | null {
  if (count === 0) return null;
  return <span style={{ color, fontSize: '0.75rem' }}>{count} {label}</span>;
}

interface FileSectionProps {
  file: ReviewFile;
  fileIdx: number;
  isSelected: boolean;
  onAcceptHunk: (fileIdx: number, hunkIdx: number) => void;
  onRejectHunk: (fileIdx: number, hunkIdx: number) => void;
}

const FileSection = React.forwardRef<HTMLDivElement, FileSectionProps>(function FileSection(
  { file, fileIdx, isSelected, onAcceptHunk, onRejectHunk },
  ref,
) {
  return (
    <div ref={ref} style={{ borderBottom: '2px solid var(--border-default)' }}>
      <FileSectionHeader file={file} isSelected={isSelected} />
      {file.hunks.map((hunk, hunkIdx) => (
        <HunkView
          key={hunk.id}
          hunk={hunk}
          onAccept={() => onAcceptHunk(fileIdx, hunkIdx)}
          onReject={() => onRejectHunk(fileIdx, hunkIdx)}
        />
      ))}
    </div>
  );
});

function FileSectionHeader({
  file,
  isSelected,
}: {
  file: ReviewFile;
  isSelected: boolean;
}): React.ReactElement {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 12px',
        backgroundColor: isSelected ? 'rgba(88, 166, 255, 0.06)' : 'var(--surface-panel)',
        borderBottom: '1px solid var(--border-default)',
        fontSize: '0.8125rem',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-primary)',
        userSelect: 'none',
      }}
    >
      <StatusIcon status={file.status} />
      <span style={{ fontWeight: 500 }}>{file.relativePath}</span>
      {file.oldPath && <span style={{ color: 'var(--text-faint)', fontSize: '0.75rem' }}>(was {file.oldPath})</span>}
      <span style={{ color: 'var(--text-faint)', fontSize: '0.75rem', marginLeft: 'auto' }}>
        {file.hunks.length} hunk{file.hunks.length !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

function StatusIcon({ status }: { status: ReviewFile['status'] }): React.ReactElement {
  const { color, label } = getStatusMeta(status);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '18px',
        height: '18px',
        borderRadius: '3px',
        fontSize: '0.6875rem',
        fontWeight: 700,
        color,
        border: `1px solid ${color}`,
        fontFamily: 'var(--font-ui)',
      }}
    >
      {label}
    </span>
  );
}

function getStatusMeta(status: ReviewFile['status']): { color: string; label: string } {
  if (status === 'added') return { color: 'var(--status-success, #4CAF50)', label: 'A' };
  if (status === 'deleted') return { color: 'var(--status-error, #f85149)', label: 'D' };
  if (status === 'renamed') return { color: 'var(--interactive-accent, #58a6ff)', label: 'R' };
  return { color: 'var(--status-warning, #d29922)', label: 'M' };
}

function HeaderBtn({
  label,
  color,
  onClick,
}: {
  label: string;
  color: string;
  onClick: () => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '2px 10px',
        fontSize: '0.6875rem',
        fontFamily: 'var(--font-ui)',
        fontWeight: 500,
        border: `1px solid ${color}`,
        borderRadius: '4px',
        background: hovered ? color : 'transparent',
        color: hovered ? 'var(--text-on-accent)' : color,
        cursor: 'pointer',
        lineHeight: '1.5',
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      {label}
    </button>
  );
}
