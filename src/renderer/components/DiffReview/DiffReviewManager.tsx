/**
 * DiffReviewManager.tsx — State management for the diff review feature.
 *
 * Provides a context that manages the review lifecycle:
 * - Opening a review (loads diff from git)
 * - Accepting/rejecting individual hunks (calls git apply/revert)
 * - Bulk operations (accept all, reject all, per-file)
 * - Closing the review
 */

import React, { createContext, useContext, useCallback, useReducer, useMemo } from 'react';
import type { DiffReviewState, ReviewFile, HunkDecision } from './types';
import type { FileDiff } from '../../types/electron';

// ─── Context ─────────────────────────────────────────────────────────────────

interface DiffReviewContextValue {
  state: DiffReviewState | null;
  openReview: (sessionId: string, snapshotHash: string, projectRoot: string) => void;
  closeReview: () => void;
  acceptHunk: (fileIdx: number, hunkIdx: number) => void;
  rejectHunk: (fileIdx: number, hunkIdx: number) => void;
  acceptAllFile: (fileIdx: number) => void;
  rejectAllFile: (fileIdx: number) => void;
  acceptAll: () => void;
  rejectAll: () => void;
}

const DiffReviewContext = createContext<DiffReviewContextValue | null>(null);

export function useDiffReview(): DiffReviewContextValue {
  const ctx = useContext(DiffReviewContext);
  if (!ctx) throw new Error('useDiffReview must be used within DiffReviewProvider');
  return ctx;
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

type Action =
  | { type: 'OPEN'; sessionId: string; snapshotHash: string; projectRoot: string }
  | { type: 'LOADED'; files: ReviewFile[] }
  | { type: 'ERROR'; error: string }
  | { type: 'CLOSE' }
  | { type: 'SET_DECISION'; fileIdx: number; hunkIdx: number; decision: HunkDecision }
  | { type: 'SET_FILE_DECISION'; fileIdx: number; decision: HunkDecision }
  | { type: 'SET_ALL_DECISION'; decision: HunkDecision };

function reducer(state: DiffReviewState | null, action: Action): DiffReviewState | null {
  switch (action.type) {
    case 'OPEN':
      return {
        sessionId: action.sessionId,
        snapshotHash: action.snapshotHash,
        projectRoot: action.projectRoot,
        files: [],
        loading: true,
        error: null,
      };

    case 'LOADED':
      if (!state) return null;
      return { ...state, files: action.files, loading: false };

    case 'ERROR':
      if (!state) return null;
      return { ...state, error: action.error, loading: false };

    case 'CLOSE':
      return null;

    case 'SET_DECISION': {
      if (!state) return null;
      const files = state.files.map((f, fi) => {
        if (fi !== action.fileIdx) return f;
        return {
          ...f,
          hunks: f.hunks.map((h, hi) => {
            if (hi !== action.hunkIdx) return h;
            return { ...h, decision: action.decision };
          }),
        };
      });
      return { ...state, files };
    }

    case 'SET_FILE_DECISION': {
      if (!state) return null;
      const files = state.files.map((f, fi) => {
        if (fi !== action.fileIdx) return f;
        return {
          ...f,
          hunks: f.hunks.map((h) =>
            h.decision === 'pending' ? { ...h, decision: action.decision } : h
          ),
        };
      });
      return { ...state, files };
    }

    case 'SET_ALL_DECISION': {
      if (!state) return null;
      const files = state.files.map((f) => ({
        ...f,
        hunks: f.hunks.map((h) =>
          h.decision === 'pending' ? { ...h, decision: action.decision } : h
        ),
      }));
      return { ...state, files };
    }

    default:
      return state;
  }
}

// ─── Convert API response to ReviewFile[] ────────────────────────────────────

function toReviewFiles(apiFiles: FileDiff[]): ReviewFile[] {
  return apiFiles.map((f) => ({
    filePath: f.filePath,
    relativePath: f.relativePath,
    status: f.status,
    oldPath: f.oldPath,
    hunks: f.hunks.map((h, idx) => ({
      id: `${f.relativePath}:${idx}`,
      header: h.header,
      oldStart: h.oldStart,
      oldCount: h.oldCount,
      newStart: h.newStart,
      newCount: h.newCount,
      lines: h.lines,
      rawPatch: h.rawPatch,
      decision: 'pending' as const,
    })),
  }));
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function DiffReviewProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, null);

  const openReview = useCallback((sessionId: string, snapshotHash: string, projectRoot: string) => {
    dispatch({ type: 'OPEN', sessionId, snapshotHash, projectRoot });

    void window.electronAPI.git.diffReview(projectRoot, snapshotHash).then((result) => {
      if (!result.success || !result.files) {
        dispatch({ type: 'ERROR', error: result.error ?? 'Failed to load diff' });
        return;
      }
      dispatch({ type: 'LOADED', files: toReviewFiles(result.files) });
    }).catch((err) => {
      dispatch({ type: 'ERROR', error: err instanceof Error ? err.message : String(err) });
    });
  }, []);

  const closeReview = useCallback(() => {
    dispatch({ type: 'CLOSE' });
  }, []);

  const acceptHunk = useCallback((fileIdx: number, hunkIdx: number) => {
    if (!state) return;
    const hunk = state.files[fileIdx]?.hunks[hunkIdx];
    if (!hunk || hunk.decision !== 'pending') return;

    // Optimistically update UI, then apply via git
    dispatch({ type: 'SET_DECISION', fileIdx, hunkIdx, decision: 'accepted' });

    // Accept = keep the change as-is (no git operation needed since the change is already in the working tree)
    // The hunk is already applied — marking it accepted is just bookkeeping.
  }, [state]);

  const rejectHunk = useCallback((fileIdx: number, hunkIdx: number) => {
    if (!state) return;
    const hunk = state.files[fileIdx]?.hunks[hunkIdx];
    if (!hunk || hunk.decision !== 'pending') return;

    // Reject = reverse-apply the hunk to undo the change
    dispatch({ type: 'SET_DECISION', fileIdx, hunkIdx, decision: 'rejected' });

    void window.electronAPI.git.revertHunk(state.projectRoot, hunk.rawPatch).catch(() => {
      // If revert fails, reset to pending
      dispatch({ type: 'SET_DECISION', fileIdx, hunkIdx, decision: 'pending' });
    });
  }, [state]);

  const acceptAllFile = useCallback((fileIdx: number) => {
    if (!state) return;
    // Accept all pending hunks in this file (just bookkeeping — changes are already in working tree)
    dispatch({ type: 'SET_FILE_DECISION', fileIdx, decision: 'accepted' });
  }, [state]);

  const rejectAllFile = useCallback((fileIdx: number) => {
    if (!state) return;
    const file = state.files[fileIdx];
    if (!file) return;

    dispatch({ type: 'SET_FILE_DECISION', fileIdx, decision: 'rejected' });

    // Revert all pending hunks in this file (reverse order to avoid offset issues)
    const pendingHunks = file.hunks
      .map((h, idx) => ({ hunk: h, idx }))
      .filter(({ hunk }) => hunk.decision === 'pending')
      .reverse();

    void (async () => {
      for (const { hunk, idx } of pendingHunks) {
        const result = await window.electronAPI.git.revertHunk(state.projectRoot, hunk.rawPatch);
        if (!result.success) {
          // Reset failed hunks to pending
          dispatch({ type: 'SET_DECISION', fileIdx, hunkIdx: idx, decision: 'pending' });
        }
      }
    })();
  }, [state]);

  const acceptAll = useCallback(() => {
    if (!state) return;
    // Accept all = keep all changes (just bookkeeping)
    dispatch({ type: 'SET_ALL_DECISION', decision: 'accepted' });
  }, [state]);

  const rejectAll = useCallback(() => {
    if (!state) return;

    dispatch({ type: 'SET_ALL_DECISION', decision: 'rejected' });

    // Revert all pending hunks across all files
    void (async () => {
      for (let fi = state.files.length - 1; fi >= 0; fi--) {
        const file = state.files[fi];
        const pendingHunks = file.hunks
          .map((h, idx) => ({ hunk: h, idx }))
          .filter(({ hunk }) => hunk.decision === 'pending')
          .reverse();

        for (const { hunk, idx } of pendingHunks) {
          const result = await window.electronAPI.git.revertHunk(state.projectRoot, hunk.rawPatch);
          if (!result.success) {
            dispatch({ type: 'SET_DECISION', fileIdx: fi, hunkIdx: idx, decision: 'pending' });
          }
        }
      }
    })();
  }, [state]);

  const value = useMemo<DiffReviewContextValue>(() => ({
    state,
    openReview,
    closeReview,
    acceptHunk,
    rejectHunk,
    acceptAllFile,
    rejectAllFile,
    acceptAll,
    rejectAll,
  }), [state, openReview, closeReview, acceptHunk, rejectHunk, acceptAllFile, rejectAllFile, acceptAll, rejectAll]);

  return (
    <DiffReviewContext.Provider value={value}>
      {children}
    </DiffReviewContext.Provider>
  );
}
