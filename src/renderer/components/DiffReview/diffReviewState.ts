import type { Dispatch } from 'react';
import { useCallback } from 'react';

import type { FileDiff } from '../../types/electron';
import type { DiffReviewState, HunkDecision, ReviewFile } from './types';

export type DiffReviewAction =
  | { type: 'OPEN'; sessionId: string; snapshotHash: string; projectRoot: string }
  | { type: 'LOADED'; files: ReviewFile[] }
  | { type: 'ERROR'; error: string }
  | { type: 'CLOSE' }
  | { type: 'SET_DECISION'; fileIdx: number; hunkIdx: number; decision: HunkDecision }
  | { type: 'SET_FILE_DECISION'; fileIdx: number; decision: HunkDecision }
  | { type: 'SET_ALL_DECISION'; decision: HunkDecision };

export interface DiffReviewActions {
  openReview: (sessionId: string, snapshotHash: string, projectRoot: string) => void;
  closeReview: () => void;
  acceptHunk: (fileIdx: number, hunkIdx: number) => void;
  rejectHunk: (fileIdx: number, hunkIdx: number) => void;
  acceptAllFile: (fileIdx: number) => void;
  rejectAllFile: (fileIdx: number) => void;
  acceptAll: () => void;
  rejectAll: () => void;
}

type ReviewDispatch = Dispatch<DiffReviewAction>;

interface PendingHunkRef {
  fileIdx: number;
  hunkIdx: number;
  rawPatch: string;
}

function buildOpenState(action: Extract<DiffReviewAction, { type: 'OPEN' }>): DiffReviewState {
  return {
    sessionId: action.sessionId,
    snapshotHash: action.snapshotHash,
    projectRoot: action.projectRoot,
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
    hunks: file.hunks.map((hunk) => (
      hunk.decision === 'pending' ? { ...hunk, decision } : hunk
    )),
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
    hunks: file.hunks.map((hunk, index) => (
      index === hunkIdx ? { ...hunk, decision } : hunk
    )),
  }));
  return withFiles(state, files);
}

function setFileDecision(
  state: DiffReviewState,
  fileIdx: number,
  decision: HunkDecision,
): DiffReviewState {
  return withFiles(state, updateFile(state.files, fileIdx, (file) => updatePendingHunks(file, decision)));
}

function setAllDecision(state: DiffReviewState, decision: HunkDecision): DiffReviewState {
  return withFiles(state, state.files.map((file) => updatePendingHunks(file, decision)));
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

export function toReviewFiles(apiFiles: FileDiff[]): ReviewFile[] {
  return apiFiles.map((file) => ({
    filePath: file.filePath,
    relativePath: file.relativePath,
    status: file.status,
    oldPath: file.oldPath,
    hunks: file.hunks.map((hunk, index) => ({
      id: `${file.relativePath}:${index}`,
      header: hunk.header,
      oldStart: hunk.oldStart,
      oldCount: hunk.oldCount,
      newStart: hunk.newStart,
      newCount: hunk.newCount,
      lines: hunk.lines,
      rawPatch: hunk.rawPatch,
      decision: 'pending' as const,
    })),
  }));
}

function getPendingHunk(
  state: DiffReviewState | null,
  fileIdx: number,
  hunkIdx: number,
): PendingHunkRef | null {
  const hunk = state?.files[fileIdx]?.hunks[hunkIdx];
  if (!hunk || hunk.decision !== 'pending') return null;
  return { fileIdx, hunkIdx, rawPatch: hunk.rawPatch };
}

function getPendingEntriesForFile(file: ReviewFile, fileIdx: number): PendingHunkRef[] {
  return file.hunks.reduceRight<PendingHunkRef[]>((entries, hunk, hunkIdx) => {
    if (hunk.decision === 'pending') entries.push({ fileIdx, hunkIdx, rawPatch: hunk.rawPatch });
    return entries;
  }, []);
}

function getPendingEntries(files: ReviewFile[]): PendingHunkRef[] {
  const entries: PendingHunkRef[] = [];
  for (let fileIdx = files.length - 1; fileIdx >= 0; fileIdx -= 1) {
    entries.push(...getPendingEntriesForFile(files[fileIdx], fileIdx));
  }
  return entries;
}

async function revertPendingEntries(
  projectRoot: string,
  entries: PendingHunkRef[],
  dispatch: ReviewDispatch,
): Promise<void> {
  for (const entry of entries) {
    const result = await window.electronAPI.git.revertHunk(projectRoot, entry.rawPatch);
    if (!result.success) {
      dispatch({
        type: 'SET_DECISION',
        fileIdx: entry.fileIdx,
        hunkIdx: entry.hunkIdx,
        decision: 'pending',
      });
    }
  }
}

async function stagePendingEntries(
  projectRoot: string,
  entries: PendingHunkRef[],
  dispatch: ReviewDispatch,
): Promise<void> {
  for (const entry of entries) {
    const result = await window.electronAPI.git.stageHunk(projectRoot, entry.rawPatch);
    if (!result.success) {
      dispatch({
        type: 'SET_DECISION',
        fileIdx: entry.fileIdx,
        hunkIdx: entry.hunkIdx,
        decision: 'pending',
      });
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadReviewFiles(dispatch: ReviewDispatch, projectRoot: string, snapshotHash: string): void {
  void window.electronAPI.git.diffReview(projectRoot, snapshotHash)
    .then((result) => {
      if (!result.success || !result.files) {
        dispatch({ type: 'ERROR', error: result.error ?? 'Failed to load diff' });
        return;
      }
      dispatch({ type: 'LOADED', files: toReviewFiles(result.files) });
    })
    .catch((error) => {
      dispatch({ type: 'ERROR', error: getErrorMessage(error) });
    });
}

export function useReviewLifecycleActions(
  dispatch: ReviewDispatch,
): Pick<DiffReviewActions, 'openReview' | 'closeReview'> {
  const openReview = useCallback((sessionId: string, snapshotHash: string, projectRoot: string) => {
    dispatch({ type: 'OPEN', sessionId, snapshotHash, projectRoot });
    loadReviewFiles(dispatch, projectRoot, snapshotHash);
  }, [dispatch]);

  const closeReview = useCallback(() => {
    dispatch({ type: 'CLOSE' });
  }, [dispatch]);

  return { openReview, closeReview };
}

export function useSingleHunkActions(
  state: DiffReviewState | null,
  dispatch: ReviewDispatch,
): Pick<DiffReviewActions, 'acceptHunk' | 'rejectHunk'> {
  const acceptHunk = useCallback((fileIdx: number, hunkIdx: number) => {
    const pendingHunk = getPendingHunk(state, fileIdx, hunkIdx);
    if (!state || !pendingHunk) return;
    dispatch({ type: 'SET_DECISION', fileIdx, hunkIdx, decision: 'accepted' });
    void window.electronAPI.git.stageHunk(state.projectRoot, pendingHunk.rawPatch).catch((error) => {
      console.error('[diffReview] Failed to stage hunk:', error);
      dispatch({ type: 'SET_DECISION', fileIdx, hunkIdx, decision: 'pending' });
    });
  }, [dispatch, state]);

  const rejectHunk = useCallback((fileIdx: number, hunkIdx: number) => {
    const pendingHunk = getPendingHunk(state, fileIdx, hunkIdx);
    if (!state || !pendingHunk) return;

    dispatch({ type: 'SET_DECISION', fileIdx, hunkIdx, decision: 'rejected' });
    void window.electronAPI.git.revertHunk(state.projectRoot, pendingHunk.rawPatch).catch((error) => {
      console.error('[diffReview] Failed to revert hunk:', error);
      dispatch({ type: 'SET_DECISION', fileIdx, hunkIdx, decision: 'pending' });
    });
  }, [dispatch, state]);

  return { acceptHunk, rejectHunk };
}

export function useBulkReviewActions(
  state: DiffReviewState | null,
  dispatch: ReviewDispatch,
): Pick<DiffReviewActions, 'acceptAllFile' | 'rejectAllFile' | 'acceptAll' | 'rejectAll'> {
  const acceptAllFile = useCallback((fileIdx: number) => {
    const file = state?.files[fileIdx];
    if (!state || !file) return;
    dispatch({ type: 'SET_FILE_DECISION', fileIdx, decision: 'accepted' });
    void stagePendingEntries(state.projectRoot, getPendingEntriesForFile(file, fileIdx), dispatch);
  }, [dispatch, state]);

  const rejectAllFile = useCallback((fileIdx: number) => {
    const file = state?.files[fileIdx];
    if (!state || !file) return;

    dispatch({ type: 'SET_FILE_DECISION', fileIdx, decision: 'rejected' });
    void revertPendingEntries(state.projectRoot, getPendingEntriesForFile(file, fileIdx), dispatch);
  }, [dispatch, state]);

  const acceptAll = useCallback(() => {
    if (!state) return;
    dispatch({ type: 'SET_ALL_DECISION', decision: 'accepted' });
    void stagePendingEntries(state.projectRoot, getPendingEntries(state.files), dispatch);
  }, [dispatch, state]);

  const rejectAll = useCallback(() => {
    if (!state) return;
    dispatch({ type: 'SET_ALL_DECISION', decision: 'rejected' });
    void revertPendingEntries(state.projectRoot, getPendingEntries(state.files), dispatch);
  }, [dispatch, state]);

  return { acceptAllFile, rejectAllFile, acceptAll, rejectAll };
}
