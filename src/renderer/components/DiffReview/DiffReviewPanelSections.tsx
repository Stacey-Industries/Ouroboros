import React from 'react';

import { DiffReviewHeaderActions } from './DiffReviewHeaderActions';
import type { DiffReviewStats } from './DiffReviewPanelState';
import { FileListSidebar } from './FileListSidebar';
import { HunkView } from './HunkView';
import type { ReviewFile } from './types';
interface DiffReviewLayoutProps {
  files: ReviewFile[];
  selectedFileIdx: number;
  stats: DiffReviewStats;
  canRollback: boolean;
  enhancedEnabled: boolean;
  focusedHunkId: string | null;
  onClose: () => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onRollback: () => void;
  onAcceptAllFile: (fileIdx: number) => void;
  onRejectAllFile: (fileIdx: number) => void;
  onSelectFile: (idx: number) => void;
  onAcceptHunk: (fileIdx: number, hunkIdx: number) => void;
  onRejectHunk: (fileIdx: number, hunkIdx: number) => void;
  setFileRef: (idx: number, element: HTMLDivElement | null) => void;
}

const panelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundColor: 'var(--surface-base)' };
const headerStyle: React.CSSProperties = { flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--surface-panel)', fontSize: '0.8125rem', fontFamily: 'var(--font-ui)', userSelect: 'none' };
export function DiffReviewLayout(props: DiffReviewLayoutProps): React.ReactElement {
  const { files, selectedFileIdx, stats, canRollback, enhancedEnabled, focusedHunkId } = props;
  const { onClose, onAcceptAll, onRejectAll, onRollback } = props;
  const { onAcceptAllFile, onRejectAllFile, onSelectFile, onAcceptHunk, onRejectHunk, setFileRef } = props;
  return (
    <div style={panelStyle}>
      <DiffReviewHeader
        stats={stats}
        allDecided={stats.decidedHunks === stats.totalHunks}
        canRollback={canRollback}
        enhancedEnabled={enhancedEnabled}
        files={files}
        onAcceptAll={onAcceptAll}
        onRejectAll={onRejectAll}
        onRollback={onRollback}
        onClose={onClose}
      />
      <DiffReviewBody
        files={files}
        selectedFileIdx={selectedFileIdx}
        focusedHunkId={focusedHunkId}
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

type DiffReviewBodyProps = Omit<DiffReviewLayoutProps, 'stats' | 'onClose' | 'onAcceptAll' | 'onRejectAll' | 'canRollback' | 'enhancedEnabled' | 'onRollback'>;

function DiffReviewBody({
  files,
  selectedFileIdx,
  focusedHunkId,
  onAcceptAllFile,
  onRejectAllFile,
  onSelectFile,
  onAcceptHunk,
  onRejectHunk,
  setFileRef,
}: DiffReviewBodyProps): React.ReactElement {
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
            ref={element => {
              setFileRef(fileIdx, element);
            }}
            file={file}
            fileIdx={fileIdx}
            isSelected={fileIdx === selectedFileIdx}
            focusedHunkId={focusedHunkId}
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
  canRollback,
  enhancedEnabled,
  files,
  onAcceptAll,
  onRejectAll,
  onRollback,
  onClose,
}: {
  stats: DiffReviewStats;
  allDecided: boolean;
  canRollback: boolean;
  enhancedEnabled: boolean;
  files: ReviewFile[];
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onRollback: () => void;
  onClose: () => void;
}): React.ReactElement {
  return (
    <div style={headerStyle}>
      <DiffReviewHeaderStats stats={stats} />
      <DiffReviewHeaderActions
        allDecided={allDecided}
        canRollback={canRollback}
        enhancedEnabled={enhancedEnabled}
        files={files}
        onAcceptAll={onAcceptAll}
        onRejectAll={onRejectAll}
        onRollback={onRollback}
        onClose={onClose}
      />
    </div>
  );
}

function DiffReviewHeaderStats({ stats }: { stats: DiffReviewStats }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Diff Review</span>
      <span style={{ color: 'var(--status-success)' }}>+{stats.added}</span>
      <span style={{ color: 'var(--status-error)' }}>-{stats.removed}</span>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
        {stats.decidedHunks}/{stats.totalHunks} hunks decided
      </span>
      <ReviewStat count={stats.acceptedHunks} color="var(--status-success)" label="accepted" />
      <ReviewStat count={stats.rejectedHunks} color="var(--status-error)" label="rejected" />
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
  focusedHunkId: string | null;
  isSelected: boolean;
  onAcceptHunk: (fileIdx: number, hunkIdx: number) => void;
  onRejectHunk: (fileIdx: number, hunkIdx: number) => void;
  ref?: React.Ref<HTMLDivElement>;
}

function FileSection(
  { file, fileIdx, focusedHunkId, isSelected, onAcceptHunk, onRejectHunk, ref }: FileSectionProps,
): React.ReactElement {
  return (
    <div ref={ref} style={{ borderBottom: '2px solid var(--border-default)' }}>
      <FileSectionHeader file={file} isSelected={isSelected} />
      {file.hunks.map((hunk, hunkIdx) => (
        <HunkView
          key={hunk.id}
          hunk={hunk}
          isFocused={hunk.id === focusedHunkId}
          onAccept={() => onAcceptHunk(fileIdx, hunkIdx)}
          onReject={() => onRejectHunk(fileIdx, hunkIdx)}
        />
      ))}
    </div>
  );
}

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
        backgroundColor: isSelected ? 'var(--interactive-accent-subtle)' : 'var(--surface-panel)',
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
  if (status === 'added') return { color: 'var(--status-success)', label: 'A' };
  if (status === 'deleted') return { color: 'var(--status-error)', label: 'D' };
  if (status === 'renamed') return { color: 'var(--interactive-accent)', label: 'R' };
  return { color: 'var(--status-warning)', label: 'M' };
}

