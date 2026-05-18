/**
 * hooksDiffReview.test.ts — unit tests for the diff-review tap.
 *
 * Verifies the tap's gate logic and correlation-stash mechanics without
 * hitting the real git or IPC layers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const getConfigValueMock = vi.fn();
vi.mock('./config', () => ({
  getConfigValue: (...args: unknown[]) => getConfigValueMock(...args),
}));

const dispatchSyntheticMock = vi.fn();
vi.mock('./hooks', () => ({
  dispatchSyntheticHookEvent: (...args: unknown[]) => dispatchSyntheticMock(...args),
}));

const gitTrimmedMock = vi.fn();
vi.mock('./ipc-handlers/gitOperations', () => ({
  gitTrimmed: (...args: unknown[]) => gitTrimmedMock(...args),
}));

import log from './logger';
vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import type { HookPayload } from './hooks';
import { tapDiffReview } from './hooksDiffReview';

// ── Helpers ────────────────────────────────────────────────────────────────

function makePrePayload(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    type: 'pre_tool_use',
    sessionId: 'sess-1',
    toolName: 'Write',
    correlationId: 'corr-1',
    timestamp: Date.now(),
    input: { file_path: 'src/foo.ts' },
    ...overrides,
  } as HookPayload;
}

function makePostPayload(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    type: 'post_tool_use',
    sessionId: 'sess-1',
    toolName: 'Write',
    correlationId: 'corr-1',
    timestamp: Date.now(),
    data: { filePath: 'src/foo.ts' },
    ...overrides,
  } as HookPayload;
}

function enabledSettings() {
  getConfigValueMock.mockReturnValue({ enableTerminalDiffReview: true });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('tapDiffReview', () => {
  const cwdMap = new Map<string, string>([['sess-1', '/proj']]);

  beforeEach(() => {
    vi.useFakeTimers();
    enabledSettings();
    gitTrimmedMock.mockResolvedValue('abc123');
    dispatchSyntheticMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('skips non-write-class tools', () => {
    tapDiffReview({ ...makePrePayload(), toolName: 'Read' } as HookPayload, cwdMap);
    vi.runAllTimers();
    expect(gitTrimmedMock).not.toHaveBeenCalled();
  });

  it('skips when enableTerminalDiffReview is false', () => {
    getConfigValueMock.mockReturnValue({ enableTerminalDiffReview: false });
    tapDiffReview(makePrePayload(), cwdMap);
    vi.runAllTimers();
    expect(gitTrimmedMock).not.toHaveBeenCalled();
  });

  it('captures snapshot on pre_tool_use for Write', async () => {
    tapDiffReview(makePrePayload(), cwdMap);
    await vi.runAllTimersAsync();
    await vi.runAllTimersAsync();
    expect(gitTrimmedMock).toHaveBeenCalledWith('/proj', ['rev-parse', 'HEAD']);
  });

  it('emits diff_review_ready on post_tool_use after snapshot captured', async () => {
    tapDiffReview(makePrePayload(), cwdMap);
    await vi.runAllTimersAsync();
    await vi.runAllTimersAsync();

    tapDiffReview(makePostPayload(), cwdMap);

    expect(dispatchSyntheticMock).toHaveBeenCalledTimes(1);
    const emitted = dispatchSyntheticMock.mock.calls[0][0];
    expect(emitted.type).toBe('diff_review_ready');
    expect(emitted.sessionId).toBe('sess-1');
    expect(emitted.snapshotHash).toBe('abc123');
    expect(emitted.projectRoot).toBe('/proj');
  });

  it('does NOT emit when post arrives with no matching pre (no stash)', () => {
    tapDiffReview(makePostPayload(), cwdMap);
    expect(dispatchSyntheticMock).not.toHaveBeenCalled();
  });

  it('is idempotent — second pre with same correlationId does not double-stash', async () => {
    tapDiffReview(makePrePayload(), cwdMap);
    await vi.runAllTimersAsync();
    await vi.runAllTimersAsync();

    tapDiffReview(makePrePayload(), cwdMap); // duplicate
    await vi.runAllTimersAsync();
    await vi.runAllTimersAsync();

    tapDiffReview(makePostPayload(), cwdMap);
    expect(dispatchSyntheticMock).toHaveBeenCalledTimes(1);
  });

  it('logs warn and skips emit when git snapshot fails', async () => {
    gitTrimmedMock.mockRejectedValue(new Error('not a git repo'));
    tapDiffReview(makePrePayload(), cwdMap);
    await vi.runAllTimersAsync();
    await vi.runAllTimersAsync();

    tapDiffReview(makePostPayload(), cwdMap);
    expect(dispatchSyntheticMock).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalled();
  });

  it('uses payload.cwd when sessionId is not in sessionCwdMap (terminal-launched claude)', async () => {
    const emptyCwdMap = new Map<string, string>();
    tapDiffReview(
      makePrePayload({ sessionId: 'external-uuid', cwd: '/external/proj' }),
      emptyCwdMap,
    );
    await vi.runAllTimersAsync();
    await vi.runAllTimersAsync();
    expect(gitTrimmedMock).toHaveBeenCalledWith('/external/proj', ['rev-parse', 'HEAD']);

    tapDiffReview(makePostPayload({ sessionId: 'external-uuid' }), emptyCwdMap);
    expect(dispatchSyntheticMock).toHaveBeenCalledTimes(1);
    const emitted = dispatchSyntheticMock.mock.calls[0][0];
    expect(emitted.projectRoot).toBe('/external/proj');
    expect(emitted.sessionId).toBe('external-uuid');
  });

  it('handles MultiEdit filePaths forwarded from hook script', async () => {
    tapDiffReview(
      makePrePayload({
        toolName: 'MultiEdit',
        input: { edits: [{ file_path: 'a.ts' }, { file_path: 'b.ts' }] },
      }),
      cwdMap,
    );
    await vi.runAllTimersAsync();
    await vi.runAllTimersAsync();

    tapDiffReview(
      makePostPayload({ toolName: 'MultiEdit', data: { filePaths: ['a.ts', 'b.ts'] } }),
      cwdMap,
    );
    const emitted = dispatchSyntheticMock.mock.calls[0][0];
    expect(emitted.filePaths).toEqual(['a.ts', 'b.ts']);
  });
});
