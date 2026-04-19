/**
 * diffReviewState.stale.ts — Stale-file detection hooks for the diff review.
 *
 * Extracted from diffReviewState.ts to stay under the 300-line ESLint limit.
 *
 * When files tracked by the current diff review are externally modified while
 * the review is open, these hooks detect the change via the files:onFileChange
 * IPC event and surface a re-prompt before any stage/revert IPC call proceeds.
 */

import log from 'electron-log/renderer';
import type { Dispatch } from 'react';
import { useCallback, useEffect } from 'react';

import type { DiffReviewAction } from './diffReviewState';
import type { DiffReviewState } from './types';

type ReviewDispatch = Dispatch<DiffReviewAction>;

/** Returns true if the file at fileIdx has been externally modified. */
export function isFileStale(state: DiffReviewState, fileIdx: number): boolean {
  const relativePath = state.files[fileIdx]?.relativePath;
  return relativePath !== undefined && state.staleFiles.includes(relativePath);
}

export function executeAcceptHunk(
  state: DiffReviewState,
  dispatch: ReviewDispatch,
  fileIdx: number,
  hunkIdx: number,
): void {
  const hunk = state.files[fileIdx]?.hunks[hunkIdx];
  if (!hunk || hunk.decision !== 'pending') return;
  const hunkId = hunk.id ?? '';
  dispatch({ type: 'SET_DECISION', fileIdx, hunkIdx, decision: 'accepted' });
  dispatch({ type: 'CAPTURE_BATCH', hunkIds: hunkId ? [hunkId] : [] });
  void window.electronAPI.git
    .stageHunk(state.projectRoot, hunk.rawPatch)
    .catch((error) => {
      log.error('Failed to stage hunk:', error);
      dispatch({ type: 'SET_DECISION', fileIdx, hunkIdx, decision: 'pending' });
      dispatch({ type: 'CAPTURE_BATCH', hunkIds: [] });
    });
}

export function executeRejectHunk(
  state: DiffReviewState,
  dispatch: ReviewDispatch,
  fileIdx: number,
  hunkIdx: number,
): void {
  const hunk = state.files[fileIdx]?.hunks[hunkIdx];
  if (!hunk || hunk.decision !== 'pending') return;
  dispatch({ type: 'SET_DECISION', fileIdx, hunkIdx, decision: 'rejected' });
  dispatch({ type: 'CAPTURE_BATCH', hunkIds: [] });
  void window.electronAPI.git
    .revertHunk(state.projectRoot, hunk.rawPatch)
    .catch((error) => {
      log.error('Failed to revert hunk:', error);
      dispatch({ type: 'SET_DECISION', fileIdx, hunkIdx, decision: 'pending' });
    });
}

/**
 * Executes the pending stale op after the user has confirmed they want to proceed.
 * Dispatches DISMISS_STALE_OP internally, then re-invokes the original operation.
 */
export function useConfirmStaleOp(
  state: DiffReviewState | null,
  dispatch: ReviewDispatch,
): { confirmStaleOp: () => void; dismissStaleOp: () => void } {
  const confirmStaleOp = useCallback(() => {
    if (!state?.stalePendingOp) return;
    const { kind, fileIdx, hunkIdx } = state.stalePendingOp;
    dispatch({ type: 'DISMISS_STALE_OP' });
    if (kind === 'stage') {
      executeAcceptHunk(state, dispatch, fileIdx, hunkIdx);
    } else {
      executeRejectHunk(state, dispatch, fileIdx, hunkIdx);
    }
  }, [state, dispatch]);

  const dismissStaleOp = useCallback(() => {
    dispatch({ type: 'DISMISS_STALE_OP' });
  }, [dispatch]);

  return { confirmStaleOp, dismissStaleOp };
}

/**
 * Subscribes to file-change events from the main process and marks files stale
 * when they are modified while the diff review is open.
 *
 * Re-subscribes only when the tracked file set changes (i.e. after LOADED),
 * so this does not cause excessive re-renders during user interaction.
 */
export function useStaleFileWatcher(
  state: DiffReviewState | null,
  dispatch: ReviewDispatch,
): void {
  useEffect(() => {
    if (!state || !window.electronAPI?.files?.onFileChange) return;
    const trackedPaths = new Set(state.files.map((f) => f.filePath));
    const cleanup = window.electronAPI.files.onFileChange((change) => {
      if (change.type !== 'change' || !trackedPaths.has(change.path)) return;
      const file = state.files.find((f) => f.filePath === change.path);
      if (file) dispatch({ type: 'MARK_STALE', relativePath: file.relativePath });
    });
    return cleanup;
  // Intentional: re-subscribe only when the file list changes, not on every state update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.files, dispatch]);
}
