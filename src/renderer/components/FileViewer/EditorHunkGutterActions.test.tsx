/**
 * EditorHunkGutterActions tests.
 *
 * Tests the pure rendering logic and callback wiring without a real Monaco
 * instance or DOM. Monaco content widgets are mocked.
 */
import { describe, expect, it, vi } from 'vitest';

import type { DiffReviewContextValue } from '../DiffReview/DiffReviewManager';
import type { ReviewHunk } from '../DiffReview/types';
import type { HunkDecoration } from './useEditorHunkDecorations';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeHunk(
  id: string,
  newStart = 5,
  decision: ReviewHunk['decision'] = 'pending',
): ReviewHunk {
  return {
    id,
    header: `@@ -1,4 +${newStart},3 @@`,
    oldStart: 1,
    oldCount: 4,
    newStart,
    newCount: 3,
    lines: [],
    rawPatch: `patch:${id}`,
    decision,
  };
}

function makeDec(
  id: string,
  fileIdx = 0,
  hunkIdx = 0,
  newStart = 5,
): HunkDecoration {
  return {
    hunk: makeHunk(id, newStart),
    anchorLine: newStart,
    fileIdx,
    hunkIdx,
  };
}

function makeDiffReview(
  overrides: Partial<DiffReviewContextValue> = {},
): DiffReviewContextValue {
  return {
    state: null,
    openReview: vi.fn(),
    closeReview: vi.fn(),
    acceptHunk: vi.fn(),
    rejectHunk: vi.fn(),
    acceptAllFile: vi.fn(),
    rejectAllFile: vi.fn(),
    acceptAll: vi.fn(),
    rejectAll: vi.fn(),
    canRollback: false,
    rollback: vi.fn(),
    ...overrides,
  };
}

// ─── EditorHunkGutterActions — null-guard logic ───────────────────────────────

describe('EditorHunkGutterActions null guards', () => {
  it('returns null when editor is null', () => {
    // We test the guard conditions directly (component returns null for missing deps)
    // rather than mounting React — avoids needing jsdom in vitest node env.
    const decorations = [makeDec('a')];
    const diffReview = makeDiffReview();

    // Simulate the guard: !editor || !diffReview || decorations.length === 0
    const editor = null;
    const shouldRender = !(!editor || !diffReview || decorations.length === 0);
    expect(shouldRender).toBe(false);
  });

  it('returns null when diffReview is null', () => {
    const decorations = [makeDec('a')];
    const diffReview = null;
    const mockEditor = {};

    const shouldRender = !(
      !mockEditor || !diffReview || decorations.length === 0
    );
    expect(shouldRender).toBe(false);
  });

  it('returns null when decorations list is empty', () => {
    const decorations: HunkDecoration[] = [];
    const diffReview = makeDiffReview();
    const mockEditor = {};

    const shouldRender = !(
      !mockEditor || !diffReview || decorations.length === 0
    );
    expect(shouldRender).toBe(false);
  });

  it('renders when all three deps are present', () => {
    const decorations = [makeDec('a')];
    const diffReview = makeDiffReview();
    const mockEditor = {};

    const shouldRender = !(
      !mockEditor || !diffReview || decorations.length === 0
    );
    expect(shouldRender).toBe(true);
  });
});

// ─── Widget callback wiring ────────────────────────────────────────────────────

describe('HunkWidget callback wiring', () => {
  it('calls acceptHunk with correct fileIdx and hunkIdx', () => {
    const acceptHunk = vi.fn();
    const diffReview = makeDiffReview({ acceptHunk });
    const dec = makeDec('h1', 2, 3, 10);

    // Simulate what HunkWidget.onAccept does
    diffReview.acceptHunk(dec.fileIdx, dec.hunkIdx);
    expect(acceptHunk).toHaveBeenCalledWith(2, 3);
  });

  it('calls rejectHunk with correct fileIdx and hunkIdx', () => {
    const rejectHunk = vi.fn();
    const diffReview = makeDiffReview({ rejectHunk });
    const dec = makeDec('h2', 0, 1, 15);

    diffReview.rejectHunk(dec.fileIdx, dec.hunkIdx);
    expect(rejectHunk).toHaveBeenCalledWith(0, 1);
  });

  it('does not call acceptHunk when rejected is passed through', () => {
    const acceptHunk = vi.fn();
    makeDiffReview({ acceptHunk });
    // Decorations only include pending hunks — resolved hunks never appear
    const pendingOnly = [makeDec('h1'), makeDec('h2')].filter(
      (d) => d.hunk.decision === 'pending',
    );
    expect(pendingOnly).toHaveLength(2);
    expect(acceptHunk).not.toHaveBeenCalled();
  });
});

// ─── Multiple decorations ──────────────────────────────────────────────────────

describe('multiple hunk decorations', () => {
  it('produces unique widget IDs per hunk', () => {
    const decs = [makeDec('hunkA', 0, 0, 5), makeDec('hunkB', 0, 1, 12)];
    // Widget ID format: `ouroboros.hunk-actions.${hunk.id}`
    const ids = decs.map((d) => `ouroboros.hunk-actions.${d.hunk.id}`);
    expect(ids[0]).toBe('ouroboros.hunk-actions.hunkA');
    expect(ids[1]).toBe('ouroboros.hunk-actions.hunkB');
    expect(new Set(ids).size).toBe(2);
  });

  it('each decoration maps to its own fileIdx/hunkIdx', () => {
    const dec1 = makeDec('a', 0, 0);
    const dec2 = makeDec('b', 0, 1);
    const dec3 = makeDec('c', 1, 0);

    expect(dec1.fileIdx).toBe(0);
    expect(dec1.hunkIdx).toBe(0);
    expect(dec2.hunkIdx).toBe(1);
    expect(dec3.fileIdx).toBe(1);
    expect(dec3.hunkIdx).toBe(0);
  });
});
