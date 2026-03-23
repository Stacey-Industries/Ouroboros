import React, { useCallback, useEffect,useMemo, useRef, useState } from 'react';

import { DiffReviewLayout } from './DiffReviewPanelSections';
import {
  getDiffReviewStateView,
  getDiffReviewStats,
} from './DiffReviewPanelState';
import type { DiffReviewState } from './types';

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
  const stats = useMemo(() => getDiffReviewStats(state.files), [state.files]);
  const stateView = getDiffReviewStateView(state, onClose);
  const setFileRef = useCallback((idx: number, element: HTMLDivElement | null) => {
    if (element) fileRefs.current.set(idx, element);
    else fileRefs.current.delete(idx);
  }, []);

  useEffect(() => {
    fileRefs.current.get(selectedFileIdx)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedFileIdx]);

  if (stateView) return stateView;

  return (
    <DiffReviewLayout
      files={state.files}
      selectedFileIdx={selectedFileIdx}
      stats={stats}
      onClose={onClose}
      onAcceptAll={onAcceptAll}
      onRejectAll={onRejectAll}
      onAcceptAllFile={onAcceptAllFile}
      onRejectAllFile={onRejectAllFile}
      onSelectFile={setSelectedFileIdx}
      onAcceptHunk={onAcceptHunk}
      onRejectHunk={onRejectHunk}
      setFileRef={setFileRef}
    />
  );
}
