/**
 * DiffReviewPanel.tsx — Main panel for reviewing agent changes.
 *
 * Two-column layout: file list sidebar on the left, scrollable unified diff
 * on the right with per-hunk accept/reject buttons. Header shows stats and
 * bulk actions.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { DiffReviewState, ReviewFile } from './types';
import { FileListSidebar } from './FileListSidebar';
import { HunkView } from './HunkView';

interface DiffReviewPanelProps {
  state: DiffReviewState;
  onAcceptHunk: (fileIdx: number, hunkIdx: number) => void;
  onRejectHunk: (fileIdx: number, hunkIdx: number) => void;
  onAcceptAllFile: (fileIdx: number) => void;
  onRejectAllFile: (fileIdx: number) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onClose: () => void;
}

export function DiffReviewPanel({
  state,
  onAcceptHunk,
  onRejectHunk,
  onAcceptAllFile,
  onRejectAllFile,
  onAcceptAll,
  onRejectAll,
  onClose,
}: DiffReviewPanelProps): React.ReactElement {
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const fileRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Scroll to file when selected from sidebar
  useEffect(() => {
    const el = fileRefs.current.get(selectedFileIdx);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedFileIdx]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    let totalHunks = 0;
    let decidedHunks = 0;
    let acceptedHunks = 0;
    let rejectedHunks = 0;

    for (const file of state.files) {
      for (const hunk of file.hunks) {
        totalHunks++;
        if (hunk.decision !== 'pending') decidedHunks++;
        if (hunk.decision === 'accepted') acceptedHunks++;
        if (hunk.decision === 'rejected') rejectedHunks++;
        for (const line of hunk.lines) {
          if (line.startsWith('+')) added++;
          else if (line.startsWith('-')) removed++;
        }
      }
    }

    return { added, removed, totalHunks, decidedHunks, acceptedHunks, rejectedHunks };
  }, [state.files]);

  const allDecided = stats.decidedHunks === stats.totalHunks;

  const handleSelectFile = useCallback((idx: number) => {
    setSelectedFileIdx(idx);
  }, []);

  if (state.loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--text-muted)',
          fontSize: '0.875rem',
          fontFamily: 'var(--font-ui)',
        }}
      >
        Loading diff…
      </div>
    );
  }

  if (state.error) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--error, #f85149)',
          fontSize: '0.875rem',
          fontFamily: 'var(--font-ui)',
          padding: '20px',
          textAlign: 'center',
        }}
      >
        <div>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Failed to load diff</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{state.error}</div>
        </div>
      </div>
    );
  }

  if (state.files.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--text-muted)',
          fontSize: '0.875rem',
          fontFamily: 'var(--font-ui)',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <span>No changes detected since session started.</span>
        <button
          onClick={onClose}
          style={{
            padding: '4px 12px',
            fontSize: '0.75rem',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            background: 'transparent',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--bg)',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
          fontSize: '0.8125rem',
          fontFamily: 'var(--font-ui)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>
            Diff Review
          </span>
          <span style={{ color: 'var(--success, #4CAF50)' }}>+{stats.added}</span>
          <span style={{ color: 'var(--error, #f85149)' }}>-{stats.removed}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            {stats.decidedHunks}/{stats.totalHunks} hunks decided
          </span>
          {stats.acceptedHunks > 0 && (
            <span style={{ color: 'var(--success, #4CAF50)', fontSize: '0.75rem' }}>
              {stats.acceptedHunks} accepted
            </span>
          )}
          {stats.rejectedHunks > 0 && (
            <span style={{ color: 'var(--error, #f85149)', fontSize: '0.75rem' }}>
              {stats.rejectedHunks} rejected
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {!allDecided && (
            <>
              <HeaderBtn label="Accept All" color="var(--success, #4CAF50)" onClick={onAcceptAll} />
              <HeaderBtn label="Reject All" color="var(--error, #f85149)" onClick={onRejectAll} />
            </>
          )}
          <HeaderBtn
            label={allDecided ? 'Done' : 'Close'}
            color="var(--accent, #58a6ff)"
            onClick={onClose}
          />
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* File list sidebar */}
        <FileListSidebar
          files={state.files}
          selectedIndex={selectedFileIdx}
          onSelect={handleSelectFile}
          onAcceptAll={onAcceptAllFile}
          onRejectAll={onRejectAllFile}
        />

        {/* Diff content */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
          }}
        >
          {state.files.map((file, fileIdx) => (
            <FileSection
              key={file.filePath}
              ref={(el) => {
                if (el) fileRefs.current.set(fileIdx, el);
                else fileRefs.current.delete(fileIdx);
              }}
              file={file}
              fileIdx={fileIdx}
              isSelected={fileIdx === selectedFileIdx}
              onAcceptHunk={onAcceptHunk}
              onRejectHunk={onRejectHunk}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── File section ────────────────────────────────────────────────────────────

interface FileSectionProps {
  file: ReviewFile;
  fileIdx: number;
  isSelected: boolean;
  onAcceptHunk: (fileIdx: number, hunkIdx: number) => void;
  onRejectHunk: (fileIdx: number, hunkIdx: number) => void;
}

const FileSection = React.forwardRef<HTMLDivElement, FileSectionProps>(
  function FileSection({ file, fileIdx, isSelected, onAcceptHunk, onRejectHunk }, ref) {
    return (
      <div
        ref={ref}
        style={{
          borderBottom: '2px solid var(--border)',
        }}
      >
        {/* File header */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 12px',
            backgroundColor: isSelected ? 'rgba(88, 166, 255, 0.06)' : 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border)',
            fontSize: '0.8125rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text)',
            userSelect: 'none',
          }}
        >
          <StatusIcon status={file.status} />
          <span style={{ fontWeight: 500 }}>
            {file.relativePath}
          </span>
          {file.oldPath && (
            <span style={{ color: 'var(--text-faint)', fontSize: '0.75rem' }}>
              (was {file.oldPath})
            </span>
          )}
          <span style={{ color: 'var(--text-faint)', fontSize: '0.75rem', marginLeft: 'auto' }}>
            {file.hunks.length} hunk{file.hunks.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Hunks */}
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
  }
);

// ─── Status icon ─────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: ReviewFile['status'] }): React.ReactElement {
  const color = status === 'added'
    ? 'var(--success, #4CAF50)'
    : status === 'deleted'
    ? 'var(--error, #f85149)'
    : status === 'renamed'
    ? 'var(--accent, #58a6ff)'
    : 'var(--warning, #d29922)';

  const label = status === 'added' ? 'A' : status === 'deleted' ? 'D' : status === 'renamed' ? 'R' : 'M';

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

// ─── Header button ───────────────────────────────────────────────────────────

function HeaderBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }): React.ReactElement {
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
        color: hovered ? 'var(--bg)' : color,
        cursor: 'pointer',
        lineHeight: '1.5',
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      {label}
    </button>
  );
}
