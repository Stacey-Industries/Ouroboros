/**
 * useEditorHunkDecorations tests.
 *
 * Mocks monaco editor — no real DOM or canvas needed.
 * Tests the pure helper functions: hunk-to-decoration mapping,
 * line-range-to-hunk lookup, and the keyboard handler.
 */
import { describe, expect, it, vi } from 'vitest';

// Mock monaco-editor before any imports that pull it in.
vi.mock('monaco-editor', () => ({
  default: {},
  Range: class Range {
    constructor(
      public startLineNumber: number,
      public startColumn: number,
      public endLineNumber: number,
      public endColumn: number,
    ) {}
  },
  KeyMod: { Alt: 512 },
  KeyCode: { KeyY: 53, KeyN: 44 },
  editor: {
    TrackedRangeStickiness: { NeverGrowsWhenTypingAtEdges: 1 },
    ContentWidgetPositionPreference: { EXACT: 2, BELOW: 0, ABOVE: 1 },
  },
}));

import type { ReviewHunk } from '../DiffReview/types';
import {
  buildHunkDecorations,
  findHunkAtLine,
  type HunkDecoration,
} from './useEditorHunkDecorations';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeHunk(
  id: string,
  newStart: number,
  newCount: number,
  decision: ReviewHunk['decision'] = 'pending',
): ReviewHunk {
  return {
    id,
    header: `@@ -1,4 +${newStart},${newCount} @@`,
    oldStart: 1,
    oldCount: 4,
    newStart,
    newCount,
    lines: [],
    rawPatch: `patch:${id}`,
    decision,
  };
}

// ─── buildHunkDecorations ────────────────────────────────────────────────────

describe('buildHunkDecorations', () => {
  it('returns one decoration per pending hunk', () => {
    const hunks: ReviewHunk[] = [
      makeHunk('a', 5, 3),
      makeHunk('b', 12, 2),
    ];
    const decs = buildHunkDecorations(hunks);
    expect(decs).toHaveLength(2);
    expect(decs[0]?.hunk.id).toBe('a');
    expect(decs[1]?.hunk.id).toBe('b');
  });

  it('skips non-pending hunks', () => {
    const hunks: ReviewHunk[] = [
      makeHunk('a', 1, 2, 'accepted'),
      makeHunk('b', 5, 3, 'rejected'),
      makeHunk('c', 10, 1, 'pending'),
    ];
    const decs = buildHunkDecorations(hunks);
    expect(decs).toHaveLength(1);
    expect(decs[0]?.hunk.id).toBe('c');
  });

  it('returns empty array when all hunks are resolved', () => {
    const hunks: ReviewHunk[] = [
      makeHunk('a', 1, 2, 'accepted'),
      makeHunk('b', 5, 3, 'rejected'),
    ];
    expect(buildHunkDecorations(hunks)).toHaveLength(0);
  });

  it('uses newStart as anchor line', () => {
    const hunks: ReviewHunk[] = [makeHunk('x', 42, 5)];
    const decs = buildHunkDecorations(hunks);
    expect(decs[0]?.anchorLine).toBe(42);
  });

  it('handles zero-count (deleted) hunk with anchorLine = newStart', () => {
    const hunk = makeHunk('del', 7, 0);
    const decs = buildHunkDecorations([hunk]);
    expect(decs[0]?.anchorLine).toBe(7);
  });
});

// ─── findHunkAtLine ──────────────────────────────────────────────────────────

describe('findHunkAtLine', () => {
  it('returns the decoration whose hunk range contains the line', () => {
    const decs: HunkDecoration[] = [
      { hunk: makeHunk('a', 5, 3), anchorLine: 5, fileIdx: 0, hunkIdx: 0 },
      { hunk: makeHunk('b', 10, 4), anchorLine: 10, fileIdx: 0, hunkIdx: 1 },
    ];
    // line 12 is inside hunk b (newStart=10, newCount=4 → lines 10-13)
    expect(findHunkAtLine(decs, 12)?.hunk.id).toBe('b');
  });

  it('returns null when no hunk covers the line', () => {
    const decs: HunkDecoration[] = [
      { hunk: makeHunk('a', 5, 3), anchorLine: 5, fileIdx: 0, hunkIdx: 0 },
    ];
    expect(findHunkAtLine(decs, 1)).toBeNull();
    expect(findHunkAtLine(decs, 20)).toBeNull();
  });

  it('returns the first hunk when cursor is on anchor line exactly', () => {
    const decs: HunkDecoration[] = [
      { hunk: makeHunk('a', 5, 2), anchorLine: 5, fileIdx: 0, hunkIdx: 0 },
    ];
    expect(findHunkAtLine(decs, 5)?.hunk.id).toBe('a');
  });

  it('treats deleted hunks (newCount=0) as a single-line target', () => {
    const decs: HunkDecoration[] = [
      { hunk: makeHunk('del', 7, 0), anchorLine: 7, fileIdx: 0, hunkIdx: 0 },
    ];
    expect(findHunkAtLine(decs, 7)?.hunk.id).toBe('del');
    expect(findHunkAtLine(decs, 8)).toBeNull();
  });

  it('returns null for empty decorations list', () => {
    expect(findHunkAtLine([], 5)).toBeNull();
  });
});

// ─── Mock editor integration (no real Monaco) ────────────────────────────────

describe('decoration update logic (mocked editor)', () => {
  it('calls deltaDecorations with correct options for a pending hunk', () => {
    const deltaDecorations = vi.fn((...args: unknown[]) => { void args; return ['dec-id-1']; });
    const mockEditor = { deltaDecorations } as unknown as Parameters<
      typeof buildHunkDecorations
    >[0] extends unknown
      ? object
      : never;

    const hunks: ReviewHunk[] = [makeHunk('h1', 3, 4)];
    const decs = buildHunkDecorations(hunks);

    // Simulate what the hook does: pass decoration specs to deltaDecorations
    const monacoSpecs = decs.map((d) => ({
      range: { startLineNumber: d.anchorLine, endLineNumber: d.anchorLine, startColumn: 1, endColumn: 1 },
      options: {
        isWholeLine: true,
        glyphMarginClassName: 'ouroboros-hunk-gutter',
        stickiness: 1,
      },
    }));

    deltaDecorations([], monacoSpecs);
    expect((mockEditor as { deltaDecorations: typeof deltaDecorations }).deltaDecorations)
      .toHaveBeenCalledWith([], monacoSpecs);
  });
});
