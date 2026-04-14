/**
 * ideToolServerApproval.test.ts — Tests for the approval.wait handler
 * in ideToolServerHandlers.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock approval manager before importing handlers
vi.mock('../approvalManager', () => ({
  waitForResolution: vi.fn(),
}));

vi.mock('../lsp', () => ({ getDiagnostics: vi.fn(() => []) }));
vi.mock('../pty', () => ({ getActiveSessions: vi.fn(() => []) }));
vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { waitForResolution } from '../approvalManager';
import { createToolHandlers } from '../ideToolServerHandlers';

const mockWaitForResolution = vi.mocked(waitForResolution);

function makeHandlers() {
  const cancelFns: Array<() => void> = [];
  const registerCancel = (fn: () => void) => cancelFns.push(fn);
  const queryRenderer = vi.fn().mockResolvedValue({});
  const execGitStatus = vi.fn().mockResolvedValue({});
  const handlers = createToolHandlers({ queryRenderer, execGitStatus, registerCancel });
  return { handlers, cancelFns, queryRenderer };
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('approval.wait handler', () => {
  it('resolves with the decision from waitForResolution', async () => {
    const cancel = vi.fn();
    mockWaitForResolution.mockReturnValue({
      promise: Promise.resolve({ decision: 'approve' as const }),
      cancel,
    });

    const { handlers } = makeHandlers();
    const result = await handlers['approval.wait']({ requestId: 'r1' });
    expect(result).toEqual({ decision: 'approve' });
  });

  it('returns approve + timeout_fallback when waitForResolution times out', async () => {
    const cancel = vi.fn();
    mockWaitForResolution.mockReturnValue({
      promise: Promise.reject(new Error('timed out after 120000ms for r2')),
      cancel,
    });

    const { handlers } = makeHandlers();
    const result = await handlers['approval.wait']({ requestId: 'r2' });
    expect(result).toEqual({ decision: 'approve', reason: 'timeout_fallback' });
  });

  it('registers a cancel function via registerCancel', async () => {
    const cancel = vi.fn();
    mockWaitForResolution.mockReturnValue({
      promise: Promise.resolve({ decision: 'approve' as const }),
      cancel,
    });

    const { handlers, cancelFns } = makeHandlers();
    await handlers['approval.wait']({ requestId: 'r3' });
    expect(cancelFns).toHaveLength(1);
  });

  it('passes timeoutMs param to waitForResolution', async () => {
    const cancel = vi.fn();
    mockWaitForResolution.mockReturnValue({
      promise: Promise.resolve({ decision: 'reject' as const, reason: 'no' }),
      cancel,
    });

    const { handlers } = makeHandlers();
    await handlers['approval.wait']({ requestId: 'r4', timeoutMs: 30_000 });
    expect(mockWaitForResolution).toHaveBeenCalledWith('r4', 30_000);
  });

  it('uses default 120000ms when timeoutMs is not provided', async () => {
    const cancel = vi.fn();
    mockWaitForResolution.mockReturnValue({
      promise: Promise.resolve({ decision: 'approve' as const }),
      cancel,
    });

    const { handlers } = makeHandlers();
    await handlers['approval.wait']({ requestId: 'r5' });
    expect(mockWaitForResolution).toHaveBeenCalledWith('r5', 120_000);
  });
});
