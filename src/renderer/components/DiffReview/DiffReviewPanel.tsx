import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DiffReviewLayout } from './DiffReviewPanelSections';
import {
  getDiffReviewStateView,
  getDiffReviewStats,
} from './DiffReviewPanelState';
import type { DiffReviewState, ReviewHunk } from './types';
import { useDiffReviewKeyboard } from './useDiffReviewKeyboard';

interface DiffReviewPanelProps {
  state: DiffReviewState;
  canRollback: boolean;
  enhancedEnabled: boolean;
  onAcceptHunk: (fileIdx: number, hunkIdx: number) => void;
  onRejectHunk: (fileIdx: number, hunkIdx: number) => void;
  onAcceptAllFile: (fileIdx: number) => void;
  onRejectAllFile: (fileIdx: number) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onRollback: () => void;
  onClose: () => void;
  onConfirmStaleOp?: () => void;
  onDismissStaleOp?: () => void;
}

const staleBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 16px',
  background: 'var(--status-warning-subtle)',
  borderBottom: '1px solid var(--border-semantic)',
  fontSize: 13,
  color: 'var(--text-semantic-primary)',
};

const staleActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  marginLeft: 'auto',
};

const btnBase: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 4,
  border: '1px solid var(--border-semantic)',
  cursor: 'pointer',
  fontSize: 12,
  background: 'var(--surface-raised)',
  color: 'var(--text-semantic-primary)',
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: 'var(--interactive-accent)',
  color: 'var(--text-on-accent)',
  border: 'none',
};

function StalePromptBar({
  staleFile,
  onConfirm,
  onDismiss,
}: {
  staleFile: string;
  onConfirm: () => void;
  onDismiss: () => void;
}): React.ReactElement {
  return (
    <div style={staleBarStyle} role="alert">
      <span>
        ⚠ <strong>{staleFile}</strong> was modified externally — refresh diff or proceed anyway?
      </span>
      <div style={staleActionsStyle}>
        <button type="button" style={btnBase} onClick={onDismiss}>
          Cancel
        </button>
        <button type="button" style={btnPrimary} onClick={onConfirm}>
          Proceed anyway
        </button>
      </div>
    </div>
  );
}

interface FlatHunk {
  fileIdx: number;
  hunkIdx: number;
  id: string;
}

function flattenHunks(files: DiffReviewState['files']): FlatHunk[] {
  return files.flatMap((file, fileIdx) =>
    file.hunks.map((hunk, hunkIdx) => ({ fileIdx, hunkIdx, id: hunk.id })),
  );
}

function useKeyboardNav(
  files: DiffReviewState['files'],
  enabled: boolean,
  onAcceptHunk: (fileIdx: number, hunkIdx: number) => void,
  onRejectHunk: (fileIdx: number, hunkIdx: number) => void,
): string | null {
  const flatHunks = useMemo(() => flattenHunks(files), [files]);
  const allHunks = useMemo<ReviewHunk[]>(() => files.flatMap((f) => f.hunks), [files]);

  const handleAccept = useCallback((id: string) => {
    const entry = flatHunks.find((h) => h.id === id);
    if (entry) onAcceptHunk(entry.fileIdx, entry.hunkIdx);
  }, [flatHunks, onAcceptHunk]);

  const handleReject = useCallback((id: string) => {
    const entry = flatHunks.find((h) => h.id === id);
    if (entry) onRejectHunk(entry.fileIdx, entry.hunkIdx);
  }, [flatHunks, onRejectHunk]);

  const { focusedHunkId } = useDiffReviewKeyboard({
    enabled, hunks: allHunks, onAccept: handleAccept, onReject: handleReject,
  });
  return focusedHunkId;
}

function useFileNavState(files: DiffReviewState['files']): {
  selectedFileIdx: number;
  setSelectedFileIdx: (idx: number) => void;
  setFileRef: (idx: number, el: HTMLDivElement | null) => void;
} {
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const fileRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const setFileRef = useCallback((idx: number, el: HTMLDivElement | null) => {
    if (el) fileRefs.current.set(idx, el);
    else fileRefs.current.delete(idx);
  }, []);
  useEffect(() => {
    fileRefs.current.get(selectedFileIdx)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedFileIdx]);
  // files only used to satisfy hook dep linting in callers; unused here intentionally.
  void files;
  return { selectedFileIdx, setSelectedFileIdx, setFileRef };
}

export function DiffReviewPanel(props: DiffReviewPanelProps): React.ReactElement {
  const { state, canRollback, enhancedEnabled, onAcceptHunk, onRejectHunk } = props;
  const { onAcceptAllFile, onRejectAllFile, onAcceptAll, onRejectAll, onRollback, onClose } = props;
  const { onConfirmStaleOp = () => undefined, onDismissStaleOp = () => undefined } = props;

  const stats = useMemo(() => getDiffReviewStats(state.files), [state.files]);
  const stateView = getDiffReviewStateView(state, onClose);
  const focusedHunkId = useKeyboardNav(state.files, enhancedEnabled, onAcceptHunk, onRejectHunk);
  const { selectedFileIdx, setSelectedFileIdx, setFileRef } = useFileNavState(state.files);

  if (stateView) return stateView;

  const stalePendingOp = state.stalePendingOp;
  const staleFilePath = stalePendingOp !== null
    ? (state.files[stalePendingOp.fileIdx]?.relativePath ?? '')
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {staleFilePath !== null && (
        <StalePromptBar staleFile={staleFilePath} onConfirm={onConfirmStaleOp} onDismiss={onDismissStaleOp} />
      )}
      <DiffReviewLayout
        files={state.files} selectedFileIdx={selectedFileIdx} stats={stats}
        canRollback={canRollback} enhancedEnabled={enhancedEnabled} focusedHunkId={focusedHunkId}
        onClose={onClose} onAcceptAll={onAcceptAll} onRejectAll={onRejectAll} onRollback={onRollback}
        onAcceptAllFile={onAcceptAllFile} onRejectAllFile={onRejectAllFile}
        onSelectFile={setSelectedFileIdx} onAcceptHunk={onAcceptHunk}
        onRejectHunk={onRejectHunk} setFileRef={setFileRef}
      />
    </div>
  );
}
