import React, { createContext, useContext, useMemo, useReducer } from 'react';

import type { DiffReviewActions } from './diffReviewState';
import {
  diffReviewReducer,
  useBulkReviewActions,
  useReviewLifecycleActions,
  useSingleHunkActions,
} from './diffReviewState';
import type { DiffReviewState } from './types';

export interface DiffReviewContextValue extends DiffReviewActions {
  state: DiffReviewState | null;
}

const DiffReviewContext = createContext<DiffReviewContextValue | null>(null);

export function useDiffReview(): DiffReviewContextValue {
  const ctx = useContext(DiffReviewContext);
  if (!ctx) throw new Error('useDiffReview must be used within DiffReviewProvider');
  return ctx;
}

export function DiffReviewProvider({ children }: { children: React.ReactNode }): React.ReactElement<any> {
  const [state, dispatch] = useReducer(diffReviewReducer, null);
  const { openReview, closeReview } = useReviewLifecycleActions(dispatch);
  const { acceptHunk, rejectHunk } = useSingleHunkActions(state, dispatch);
  const { acceptAllFile, rejectAllFile, acceptAll, rejectAll } = useBulkReviewActions(state, dispatch);

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

  return <DiffReviewContext.Provider value={value}>{children}</DiffReviewContext.Provider>;
}
