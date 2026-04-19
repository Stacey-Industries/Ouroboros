import log from 'electron-log/renderer';
import React, { createContext, useCallback, useContext, useMemo, useReducer, useRef } from 'react';

import type { DiffReviewActions } from './diffReviewState';
import {
  diffReviewReducer,
  useBulkReviewActions,
  useConfirmStaleOp,
  useReviewLifecycleActions,
  useRollbackAction,
  useSingleHunkActions,
  useStaleFileWatcher,
} from './diffReviewState';
import type { DiffReviewState } from './types';

export interface DiffReviewContextValue extends DiffReviewActions {
  state: DiffReviewState | null;
  canRollback: boolean;
  confirmStaleOp: () => void;
  dismissStaleOp: () => void;
}

const DiffReviewContext = createContext<DiffReviewContextValue | null>(null);

export function useDiffReview(): DiffReviewContextValue {
  const ctx = useContext(DiffReviewContext);
  if (!ctx) throw new Error('useDiffReview must be used within DiffReviewProvider');
  return ctx;
}

function useCheckpointGuard(state: DiffReviewState | null): () => Promise<void> {
  const firedRef = useRef(false);
  const prevStateNullRef = useRef(true);

  // Reset the guard whenever a new review session opens (null → non-null transition)
  if (state === null) prevStateNullRef.current = true;
  if (state !== null && prevStateNullRef.current) {
    prevStateNullRef.current = false;
    firedRef.current = false;
  }

  return useCallback(async () => {
    if (firedRef.current || !state) return;
    firedRef.current = true;
    const cfgResult = await window.electronAPI.config.get('autoCheckpoint').catch(() => null);
    if (cfgResult === false) return;
    const fileNames = state.files
      .map((f) => f.relativePath)
      .slice(0, 3)
      .join(', ');
    const suffix = state.files.length > 3 ? ` (+${state.files.length - 3} more)` : '';
    const msg = `before applying changes to ${fileNames}${suffix}`;
    await window.electronAPI.git.checkpoint(state.projectRoot, msg).catch((err) => {
      log.warn('[checkpoint] failed (non-blocking):', err);
    });
  }, [state]);
}

function useWrappedAcceptActions(
  base: Pick<DiffReviewActions, 'acceptHunk' | 'acceptAllFile' | 'acceptAll'>,
  checkpoint: () => Promise<void>,
): Pick<DiffReviewActions, 'acceptHunk' | 'acceptAllFile' | 'acceptAll'> {
  const acceptHunk = useCallback(
    (fileIdx: number, hunkIdx: number) => {
      void checkpoint().then(() => base.acceptHunk(fileIdx, hunkIdx));
    },
    [checkpoint, base],
  );
  const acceptAllFile = useCallback(
    (fileIdx: number) => {
      void checkpoint().then(() => base.acceptAllFile(fileIdx));
    },
    [checkpoint, base],
  );
  const acceptAll = useCallback(() => {
    void checkpoint().then(() => base.acceptAll());
  }, [checkpoint, base]);
  return { acceptHunk, acceptAllFile, acceptAll };
}

function useDiffReviewContextValue(): DiffReviewContextValue {
  const [state, dispatch] = useReducer(diffReviewReducer, null);
  const { openReview, closeReview } = useReviewLifecycleActions(dispatch);
  const { acceptHunk: baseAcceptHunk, rejectHunk } = useSingleHunkActions(state, dispatch);
  const { acceptAllFile: baseAcceptAllFile, rejectAllFile, acceptAll: baseAcceptAll, rejectAll } =
    useBulkReviewActions(state, dispatch);
  const checkpoint = useCheckpointGuard(state);
  const { acceptHunk, acceptAllFile, acceptAll } = useWrappedAcceptActions(
    { acceptHunk: baseAcceptHunk, acceptAllFile: baseAcceptAllFile, acceptAll: baseAcceptAll },
    checkpoint,
  );
  const { canRollback, rollback } = useRollbackAction(state, dispatch);
  const { confirmStaleOp, dismissStaleOp } = useConfirmStaleOp(state, dispatch);
  useStaleFileWatcher(state, dispatch);
  return useMemo<DiffReviewContextValue>(
    () => ({
      state, openReview, closeReview,
      acceptHunk, rejectHunk, acceptAllFile, rejectAllFile, acceptAll, rejectAll,
      canRollback, rollback, confirmStaleOp, dismissStaleOp,
    }),
    [state, openReview, closeReview, acceptHunk, rejectHunk, acceptAllFile, rejectAllFile, acceptAll, rejectAll, canRollback, rollback, confirmStaleOp, dismissStaleOp],
  );
}

export function DiffReviewProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const value = useDiffReviewContextValue();
  return <DiffReviewContext.Provider value={value}>{children}</DiffReviewContext.Provider>;
}
