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

export function DiffReviewPanel(props: DiffReviewPanelProps): React.ReactElement {
  const { state, canRollback, enhancedEnabled, onAcceptHunk, onRejectHunk } = props;
  const { onAcceptAllFile, onRejectAllFile, onAcceptAll, onRejectAll, onRollback, onClose } = props;

  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const fileRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const stats = useMemo(() => getDiffReviewStats(state.files), [state.files]);
  const stateView = getDiffReviewStateView(state, onClose);
  const setFileRef = useCallback((idx: number, el: HTMLDivElement | null) => {
    if (el) fileRefs.current.set(idx, el);
    else fileRefs.current.delete(idx);
  }, []);
  const focusedHunkId = useKeyboardNav(state.files, enhancedEnabled, onAcceptHunk, onRejectHunk);

  useEffect(() => {
    fileRefs.current.get(selectedFileIdx)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedFileIdx]);

  if (stateView) return stateView;

  return (
    <DiffReviewLayout
      files={state.files} selectedFileIdx={selectedFileIdx} stats={stats}
      canRollback={canRollback} enhancedEnabled={enhancedEnabled} focusedHunkId={focusedHunkId}
      onClose={onClose} onAcceptAll={onAcceptAll} onRejectAll={onRejectAll} onRollback={onRollback}
      onAcceptAllFile={onAcceptAllFile} onRejectAllFile={onRejectAllFile}
      onSelectFile={setSelectedFileIdx} onAcceptHunk={onAcceptHunk}
      onRejectHunk={onRejectHunk} setFileRef={setFileRef}
    />
  );
}
