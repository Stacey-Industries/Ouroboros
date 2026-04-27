/**
 * gotchaUpdateNudge.test.ts — Wave 49 Phase C
 *
 * Covers the classifier logic in evaluateStop:
 * - Bug-fix-shaped session triggers (existing-file diff + keyword).
 * - Greenfield session (only additions) does not trigger.
 * - Commit-message keyword alone (no diff signal) does not trigger.
 * - Diff signal alone (no keyword) does not trigger.
 * - Missing fields are tolerated (no throw).
 */

import { describe, expect, it } from 'vitest';

import type { HookPayload } from '../hooks';
import { evaluateStop, hasBugFixKeyword, hasExistingFileChanges } from './gotchaUpdateNudge';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    type: 'session_stop',
    sessionId: 'test-session-id',
    timestamp: Date.now(),
    ...overrides,
  };
}

const MODIFIED_DIFF = 'M\tsrc/main/foo.ts\nM\tsrc/main/bar.ts\n';
const ADDED_ONLY_DIFF = 'A\tsrc/main/newfile.ts\nA\tsrc/main/other.ts\n';
const BUG_COMMIT = 'fix: resolve approval manager race condition';
const GREENFIELD_COMMIT = 'feat: add new terminal panel';

// ─── hasExistingFileChanges ───────────────────────────────────────────────────

describe('hasExistingFileChanges', () => {
  it('returns true for M-prefixed diff lines', () => {
    expect(hasExistingFileChanges(MODIFIED_DIFF)).toBe(true);
  });

  it('returns true for D-prefixed (deleted) diff lines', () => {
    expect(hasExistingFileChanges('D\tsrc/main/old.ts\n')).toBe(true);
  });

  it('returns true for R-prefixed (renamed) diff lines', () => {
    expect(hasExistingFileChanges('R\tsrc/main/renamed.ts\n')).toBe(true);
  });

  it('returns false for addition-only diff', () => {
    expect(hasExistingFileChanges(ADDED_ONLY_DIFF)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasExistingFileChanges('')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(hasExistingFileChanges(undefined)).toBe(false);
  });
});

// ─── hasBugFixKeyword ─────────────────────────────────────────────────────────

describe('hasBugFixKeyword', () => {
  it.each([
    ['fix: resolve crash', true],
    ['bug: memory leak in pty', true],
    ['issue #42 resolved', true],
    ['gotcha: order of imports matters', true],
    ['regression in Wave 48 output', true],
    ['defect: missing null check', true],
    ['broken: approval flow', true],
    ['feat: new panel', false],
    ['chore: update dependencies', false],
    ['docs: update CLAUDE.md', false],
    ['', false],
  ])('"%s" → %s', (msg, expected) => {
    expect(hasBugFixKeyword(msg)).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(hasBugFixKeyword('FIX: uppercase keyword')).toBe(true);
    expect(hasBugFixKeyword('BUG FIX: mixed case')).toBe(true);
  });

  it('returns false for undefined', () => {
    expect(hasBugFixKeyword(undefined)).toBe(false);
  });
});

// ─── evaluateStop ─────────────────────────────────────────────────────────────

describe('evaluateStop', () => {
  it('triggers for bug-fix-shaped session (existing-file diff + keyword)', () => {
    const result = evaluateStop(
      makePayload({ data: { diff: MODIFIED_DIFF, commitMessage: BUG_COMMIT } }),
    );
    expect(result.triggered).toBe(true);
    expect(result.reason).toContain('bug-fix keyword');
  });

  it('does not trigger for greenfield session (addition-only diff + keyword)', () => {
    const result = evaluateStop(
      makePayload({ data: { diff: ADDED_ONLY_DIFF, commitMessage: BUG_COMMIT } }),
    );
    expect(result.triggered).toBe(false);
    expect(result.reason).toContain('no existing-file changes');
  });

  it('does not trigger when keyword present but no diff signal', () => {
    const result = evaluateStop(makePayload({ data: { commitMessage: BUG_COMMIT } }));
    expect(result.triggered).toBe(false);
    expect(result.reason).toContain('no existing-file changes');
  });

  it('does not trigger when diff signal present but no keyword', () => {
    const result = evaluateStop(
      makePayload({ data: { diff: MODIFIED_DIFF, commitMessage: GREENFIELD_COMMIT } }),
    );
    expect(result.triggered).toBe(false);
    expect(result.reason).toContain('no bug-fix keyword');
  });

  it('tolerates missing data field without throwing', () => {
    expect(() => evaluateStop(makePayload())).not.toThrow();
  });

  it('tolerates null-ish data values without throwing', () => {
    expect(() =>
      evaluateStop(makePayload({ data: { diff: undefined, commitMessage: undefined } })),
    ).not.toThrow();
  });

  it('tolerates completely empty payload without throwing', () => {
    expect(() => evaluateStop({ type: 'session_stop', sessionId: '', timestamp: 0 })).not.toThrow();
  });
});
