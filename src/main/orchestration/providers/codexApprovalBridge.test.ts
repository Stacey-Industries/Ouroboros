import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApprovalResponse } from '../../approvalManager';
import { CodexApprovalBridge, normalizeCodexApprovalRequest } from './codexApprovalBridge';

const {
  requestApprovalMock,
  cancelApprovalRequestMock,
  getPendingRequestMock,
  waitForResolutionMock,
} = vi.hoisted(() => ({
  requestApprovalMock: vi.fn(),
  cancelApprovalRequestMock: vi.fn(),
  getPendingRequestMock: vi.fn(),
  waitForResolutionMock: vi.fn(),
}));

vi.mock('../../approvalManager', () => ({
  requestApproval: requestApprovalMock,
  cancelApprovalRequest: cancelApprovalRequestMock,
  getPendingRequest: getPendingRequestMock,
  waitForResolution: waitForResolutionMock,
}));

vi.mock('../../logger', () => ({
  default: {
    warn: vi.fn(),
  },
}));

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('normalizeCodexApprovalRequest', () => {
  it('maps a Codex approval payload into the shared approval shape', () => {
    const request = normalizeCodexApprovalRequest(
      {
        requestId: 'req-1',
        kind: 'shell',
        command: 'npm test',
        extra: { safe: false },
      },
      { now: () => 123, sessionId: 'session-1' },
    );

    expect(request).toEqual({
      requestId: 'req-1',
      toolName: 'shell',
      toolInput: { command: 'npm test' },
      sessionId: 'session-1',
      timestamp: 123,
      provider: 'codex',
      rawPayload: {
        requestId: 'req-1',
        kind: 'shell',
        command: 'npm test',
        extra: { safe: false },
      },
    });
  });
});

describe('CodexApprovalBridge', () => {
  beforeEach(() => {
    requestApprovalMock.mockReset();
    cancelApprovalRequestMock.mockReset();
    getPendingRequestMock.mockReset();
    waitForResolutionMock.mockReset();
    cancelApprovalRequestMock.mockReturnValue(true);
    getPendingRequestMock.mockReturnValue(undefined);
  });

  it('queues an approval and round-trips the decision back to Codex', async () => {
    const approval = deferred<ApprovalResponse>();
    waitForResolutionMock.mockReturnValue({ promise: approval.promise, cancel: vi.fn() });
    const respondToApproval = vi.fn().mockResolvedValue(undefined);
    const onStatus = vi.fn();
    const bridge = new CodexApprovalBridge({
      client: { respondToApproval },
      onStatus,
      sessionId: 'session-1',
      timeoutMs: 5000,
    });

    const resultPromise = bridge.queueApproval({
      requestId: 'req-1',
      command: 'npm test',
      kind: 'shell',
    });

    expect(requestApprovalMock).toHaveBeenCalledWith({
      requestId: 'req-1',
      toolName: 'shell',
      toolInput: { command: 'npm test' },
      sessionId: 'session-1',
      timestamp: expect.any(Number),
      provider: 'codex',
      rawPayload: { requestId: 'req-1', command: 'npm test', kind: 'shell' },
    });

    approval.resolve({ decision: 'approve' });
    await expect(resultPromise).resolves.toBe('approve');
    expect(respondToApproval).toHaveBeenCalledWith('req-1', { decision: 'approve' });
    expect(onStatus).toHaveBeenCalledWith({
      level: 'info',
      message: 'shell is waiting for approval.',
      requestId: 'req-1',
    });
  });

  it('auto-rejects when waiting for the approval decision times out', async () => {
    waitForResolutionMock.mockReturnValue({
      promise: Promise.reject(new Error('approval.wait timed out after 10ms for req-2')),
      cancel: vi.fn(),
    });
    const respondToApproval = vi.fn().mockResolvedValue(undefined);
    const onStatus = vi.fn();
    const bridge = new CodexApprovalBridge({
      client: { respondToApproval },
      onStatus,
      sessionId: 'session-1',
      timeoutMs: 10,
    });

    await expect(
      bridge.queueApproval({ requestId: 'req-2', command: 'rm -rf build', kind: 'shell' }),
    ).resolves.toBe('reject');

    expect(cancelApprovalRequestMock).toHaveBeenCalledWith(
      'req-2',
      'approval.wait timed out after 10ms for req-2',
    );
    expect(respondToApproval).toHaveBeenCalledWith('req-2', {
      decision: 'reject',
      reason: 'approval.wait timed out after 10ms for req-2',
    });
    expect(onStatus).toHaveBeenLastCalledWith({
      level: 'warning',
      message: 'approval.wait timed out after 10ms for req-2',
      requestId: 'req-2',
    });
  });

  it('cancels a pending approval without responding to Codex when the session dies', async () => {
    const approval = deferred<ApprovalResponse>();
    waitForResolutionMock.mockReturnValue({ promise: approval.promise, cancel: vi.fn() });
    const respondToApproval = vi.fn().mockResolvedValue(undefined);
    const bridge = new CodexApprovalBridge({
      client: { respondToApproval },
      sessionId: 'session-1',
    });

    const resultPromise = bridge.queueApproval({
      requestId: 'req-3',
      path: 'src/index.ts',
      kind: 'file_write',
    });

    expect(bridge.cancelPendingApproval('req-3', 'session terminated')).toBe(true);
    approval.resolve({ decision: 'reject' });

    await expect(resultPromise).resolves.toBe('reject');
    expect(cancelApprovalRequestMock).toHaveBeenCalledWith('req-3', 'session terminated');
    expect(respondToApproval).not.toHaveBeenCalled();
  });

  it('rejects duplicate request ids before enqueueing another approval', async () => {
    getPendingRequestMock.mockReturnValue({ requestId: 'req-4' });
    const bridge = new CodexApprovalBridge({
      client: { respondToApproval: vi.fn().mockResolvedValue(undefined) },
      sessionId: 'session-1',
    });

    await expect(
      bridge.queueApproval({ requestId: 'req-4', command: 'npm run lint', kind: 'shell' }),
    ).rejects.toThrow('Duplicate Codex approval request: req-4');
    expect(requestApprovalMock).not.toHaveBeenCalled();
  });
});
