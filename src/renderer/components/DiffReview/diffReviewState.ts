import log from 'electron-log/renderer';
import type { Dispatch } from 'react';
import { useCallback } from 'react';

import {
  getPendingEntries,
  getPendingEntriesForFile,
  loadReviewFiles,
  revertPendingEntries,
  stagePendingEntries,
} from './diffReviewState.ops';
import type { DiffReviewState, HunkDecision, ReviewFile } from './types';

export { toReviewFiles } from './diffReviewState.ops';

export type DiffReviewAction =
  | {
      type: 'OPEN';
      sessionId: string;
      snapshotHash: string;
      projectRoot: string;
      filePaths?: string[];
    }
  | { type: 'LOADED'; files: ReviewFile[] }
  | { type: 'ERROR'; error: string }
  | { type: 'CLOSE' }
  | { type: 'SET_DECISION'; fileIdx: number; hunkIdx: number; decision: HunkDecision }
  | { type: 'SET_FILE_DECISION'; fileIdx: number; decision: HunkDecision }
  | { type: 'SET_ALL_DECISION'; decision: HunkDecision };

export interface DiffReviewActions {
  openReview: (
    sessionId: string,
    snapshotHash: string,
    projectRoot: string,
    filePaths?: string[],
  ) => void;
  closeReview: () => void;
  acceptHunk: (fileIdx: number, hunkIdx: number) => void;
  rejectHunk: (fileIdx: number, hunkIdx: number) => void;
  acceptAllFile: (fileIdx: number) => void;
  rejectAllFile: (fileIdx: number) => void;
  acceptAll: () => void;
  rejectAll: () => void;
}

type ReviewDispatch = Dispatch<DiffReviewAction>;

function buildOpenState(action: Extract<DiffReviewAction, { type: 'OPEN' }>): DiffReviewState {
  return {
    sessionId: action.sessionId,
    snapshotHash: action.snapshotHash,
    projectRoot: action.projectRoot,
    filePaths: action.filePaths,
    files: [],
    loading: true,
    error: null,
  };
}

function withFiles(state: DiffReviewState, files: ReviewFile[]): DiffReviewState {
  return { ...state, files };
}

function updateFile(
  files: ReviewFile[],
  fileIdx: number,
  updater: (file: ReviewFile) => ReviewFile,
): ReviewFile[] {
  return files.map((file, index) => (index === fileIdx ? updater(file) : file));
}

function updatePendingHunks(file: ReviewFile, decision: HunkDecision): ReviewFile {
  return {
    ...file,
    hunks: file.hunks.map((hunk) => (hunk.decision === 'pending' ? { ...hunk, decision } : hunk)),
  };
}

function setHunkDecision(
  state: DiffReviewState,
  fileIdx: number,
  hunkIdx: number,
  decision: HunkDecision,
): DiffReviewState {
  const files = updateFile(state.files, fileIdx, (file) => ({
    ...file,
    hunks: file.hunks.map((hunk, index) => (index === hunkIdx ? { ...hunk, decision } : hunk)),
  }));
  return withFiles(state, files);
}

function setFileDecision(
  state: DiffReviewState,
  fileIdx: number,
  decision: HunkDecision,
): DiffReviewState {
  return withFiles(
    state,
    updateFile(state.files, fileIdx, (file) => updatePendingHunks(file, decision)),
  );
}

function setAllDecision(state: DiffReviewState, decision: HunkDecision): DiffReviewState {
  return withFiles(
    state,
    state.files.map((file) => updatePendingHunks(file, decision)),
  );
}

export function diffReviewReducer(
  state: DiffReviewState | null,
  action: DiffReviewAction,
): DiffReviewState | null {
  if (action.type === 'OPEN') return buildOpenState(action);
  if (!state) return action.type === 'CLOSE' ? null : state;

  switch (action.type) {
    case 'LOADED':
      return { ...state, files: action.files, loading: false };
    case 'ERROR':
      return { ...state, error: action.error, loading: false };
    case 'CLOSE':
      return null;
    case 'SET_DECISION':
      return setHunkDecision(state, action.fileIdx, action.hunkIdx, action.decision);
    case 'SET_FILE_DECISION':
      return setFileDecision(state, action.fileIdx, action.decision);
    case 'SET_ALL_DECISION':
      return setAllDecision(state, action.decision);
    default:
      return state;
  }
}

function getPendingHunk(
  state: DiffReviewState | null,
  fileIdx: number,
  hunkIdx: number,
): { fileIdx: number; hunkIdx: number; rawPatch: string } | null {
  const hunk = state?.files[fileIdx]?.hunks[hunkIdx];
  if (!hunk || hunk.decision !== 'pending') return null;
  return { fileIdx, hunkIdx, rawPatch: hunk.rawPatch };
}

export function useReviewLifecycleActions(
  dispatch: ReviewDispatch,
): Pick<DiffReviewActions, 'openReview' | 'closeReview'> {
  const openReview = useCallback(
    (sessionId: string, snapshotHash: string, projectRoot: string, filePaths?: string[]) => {
      dispatch({ type: 'OPEN', sessionId, snapshotHash, projectRoot, filePaths });
      loadReviewFiles(dispatch, projectRoot, snapshotHash, filePaths);
    },
    [dispatch],
  );

  const closeReview = useCallback(() => {
    dispatch({ type: 'CLOSE' });
  }, [dispatch]);

  return { openReview, closeReview };
}

export function useSingleHunkActions(
  state: DiffReviewState | null,
  dispatch: ReviewDispatch,
): Pick<DiffReviewActions, 'acceptHunk' | 'rejectHunk'> {
  const acceptHunk = useCallback(
    (fileIdx: number, hunkIdx: number) => {
      const pendingHunk = getPendingHunk(state, fileIdx, hunkIdx);
      if (!state || !pendingHunk) return;
      dispatch({ type: 'SET_DECISION', fileIdx, hunkIdx, decision: 'accepted' });
      void window.electronAPI.git
        .stageHunk(state.projectRoot, pendingHunk.rawPatch)
        .catch((error) => {
          log.error('Failed to stage hunk:', error);
          dispatch({ type: 'SET_DECISION', fileIdx, hunkIdx, decision: 'pending' });
        });
    },
    [dispatch, state],
  );

  const rejectHunk = useCallback(
    (fileIdx: number, hunkIdx: number) => {
      const pendingHunk = getPendingHunk(state, fileIdx, hunkIdx);
      if (!state || !pendingHunk) return;

      dispatch({ type: 'SET_DECISION', fileIdx, hunkIdx, decision: 'rejected' });
      void window.electronAPI.git
        .revertHunk(state.projectRoot, pendingHunk.rawPatch)
        .catch((error) => {
          log.error('Failed to revert hunk:', error);
          dispatch({ type: 'SET_DECISION', fileIdx, hunkIdx, decision: 'pending' });
        });
    },
    [dispatch, state],
  );

  return { acceptHunk, rejectHunk };
}

function useAcceptAllFile(
  state: DiffReviewState | null,
  dispatch: ReviewDispatch,
): (fileIdx: number) => void {
  return useCallback(
    (fileIdx: number) => {
      const file = state?.files[fileIdx];
      if (!state || !file) return;
      dispatch({ type: 'SET_FILE_DECISION', fileIdx, decision: 'accepted' });
      void stagePendingEntries(
        state.projectRoot,
        getPendingEntriesForFile(file, fileIdx),
        state.files,
        dispatch,
      );
    },
    [dispatch, state],
  );
}

function useRejectAllFile(
  state: DiffReviewState | null,
  dispatch: ReviewDispatch,
): (fileIdx: number) => void {
  return useCallback(
    (fileIdx: number) => {
      const file = state?.files[fileIdx];
      if (!state || !file) return;
      dispatch({ type: 'SET_FILE_DECISION', fileIdx, decision: 'rejected' });
      void revertPendingEntries(
        state.projectRoot,
        getPendingEntriesForFile(file, fileIdx),
        dispatch,
      );
    },
    [dispatch, state],
  );
}

export function useBulkReviewActions(
  state: DiffReviewState | null,
  dispatch: ReviewDispatch,
): Pick<DiffReviewActions, 'acceptAllFile' | 'rejectAllFile' | 'acceptAll' | 'rejectAll'> {
  const acceptAllFile = useAcceptAllFile(state, dispatch);
  const rejectAllFile = useRejectAllFile(state, dispatch);

  const acceptAll = useCallback(() => {
    if (!state) return;
    dispatch({ type: 'SET_ALL_DECISION', decision: 'accepted' });
    void stagePendingEntries(
      state.projectRoot,
      getPendingEntries(state.files),
      state.files,
      dispatch,
    );
  }, [dispatch, state]);

  const rejectAll = useCallback(() => {
    if (!state) return;
    dispatch({ type: 'SET_ALL_DECISION', decision: 'rejected' });
    void revertPendingEntries(state.projectRoot, getPendingEntries(state.files), dispatch);
  }, [dispatch, state]);

  return { acceptAllFile, rejectAllFile, acceptAll, rejectAll };
}
