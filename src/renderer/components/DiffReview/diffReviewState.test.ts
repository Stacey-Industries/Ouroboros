/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import { diffReviewReducer } from './diffReviewState';
import type { DiffReviewState, ReviewHunk } from './types';

function makeHunk(id: string, decision: ReviewHunk['decision'] = 'pending'): ReviewHunk {
  return {
    id,
    header: '@@ -1,1 +1,1 @@',
    oldStart: 1,
    oldCount: 1,
    newStart: 1,
    newCount: 1,
    lines: ['+line'],
    rawPatch: `patch-${id}`,
    decision,
  };
}

function openedState(hunks: ReviewHunk[]): DiffReviewState {
  return {
    sessionId: 's1',
    snapshotHash: 'abc',
    projectRoot: '/proj',
    files: [{ filePath: '/proj/a.ts', relativePath: 'a.ts', status: 'modified', hunks }],
    loading: false,
    error: null,
    lastAcceptedBatch: null,
  };
}

describe('diffReviewReducer — rollback', () => {
  it('canRollback is false on fresh state (lastAcceptedBatch is null)', () => {
    const state = openedState([makeHunk('h1')]);
    expect(state.lastAcceptedBatch).toBeNull();
  });

  it('CAPTURE_BATCH sets lastAcceptedBatch', () => {
    const state = openedState([makeHunk('h1')]);
    const next = diffReviewReducer(state, { type: 'CAPTURE_BATCH', hunkIds: ['h1'] });
    expect(next?.lastAcceptedBatch).toEqual(['h1']);
  });

  it('ROLLBACK_LAST_BATCH moves accepted hunks back to pending', () => {
    const state: DiffReviewState = {
      ...openedState([makeHunk('h1', 'accepted'), makeHunk('h2', 'pending')]),
      lastAcceptedBatch: ['h1'],
    };
    const next = diffReviewReducer(state, { type: 'ROLLBACK_LAST_BATCH' });
    expect(next?.files[0].hunks[0].decision).toBe('pending');
    expect(next?.files[0].hunks[1].decision).toBe('pending');
  });

  it('ROLLBACK_LAST_BATCH clears lastAcceptedBatch after rollback', () => {
    const state: DiffReviewState = {
      ...openedState([makeHunk('h1', 'accepted')]),
      lastAcceptedBatch: ['h1'],
    };
    const next = diffReviewReducer(state, { type: 'ROLLBACK_LAST_BATCH' });
    expect(next?.lastAcceptedBatch).toBeNull();
  });

  it('ROLLBACK_LAST_BATCH is a no-op when lastAcceptedBatch is null', () => {
    const state = openedState([makeHunk('h1', 'accepted')]);
    const next = diffReviewReducer(state, { type: 'ROLLBACK_LAST_BATCH' });
    expect(next?.files[0].hunks[0].decision).toBe('accepted');
    expect(next?.lastAcceptedBatch).toBeNull();
  });

  it('ROLLBACK_LAST_BATCH is a no-op when lastAcceptedBatch is empty', () => {
    const state: DiffReviewState = {
      ...openedState([makeHunk('h1', 'accepted')]),
      lastAcceptedBatch: [],
    };
    const next = diffReviewReducer(state, { type: 'ROLLBACK_LAST_BATCH' });
    expect(next?.files[0].hunks[0].decision).toBe('accepted');
  });

  it('canRollback is true after CAPTURE_BATCH with non-empty ids', () => {
    const state = openedState([makeHunk('h1')]);
    const next = diffReviewReducer(state, { type: 'CAPTURE_BATCH', hunkIds: ['h1'] });
    expect((next?.lastAcceptedBatch?.length ?? 0) > 0).toBe(true);
  });

  it('accept then reject clears lastAcceptedBatch (reject passes empty hunkIds)', () => {
    const state = openedState([makeHunk('h1'), makeHunk('h2')]);
    const afterAccept = diffReviewReducer(state, { type: 'CAPTURE_BATCH', hunkIds: ['h1'] });
    // Reject clears the batch by dispatching CAPTURE_BATCH with []
    const afterReject = diffReviewReducer(afterAccept, { type: 'CAPTURE_BATCH', hunkIds: [] });
    expect(afterReject?.lastAcceptedBatch).toEqual([]);
  });

  it('ROLLBACK_LAST_BATCH does not affect hunks not in batch', () => {
    const state: DiffReviewState = {
      ...openedState([makeHunk('h1', 'accepted'), makeHunk('h2', 'accepted')]),
      lastAcceptedBatch: ['h1'],
    };
    const next = diffReviewReducer(state, { type: 'ROLLBACK_LAST_BATCH' });
    expect(next?.files[0].hunks[0].decision).toBe('pending');
    expect(next?.files[0].hunks[1].decision).toBe('accepted');
  });
});
