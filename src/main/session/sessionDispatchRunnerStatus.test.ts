/**
 * sessionDispatchRunnerStatus.test.ts — Wave 34 Phase C.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockBroadcast = vi.fn();
vi.mock('../web/broadcast', () => ({ broadcast: (...a: unknown[]) => mockBroadcast(...a) }));

describe('sessionDispatchRunnerStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls broadcast with the correct channel and job payload', async () => {
    const { broadcastJobStatus, DISPATCH_STATUS_CHANNEL } = await import('./sessionDispatchRunnerStatus');
    const job = { id: 'j1', status: 'running', request: { title: 'T', prompt: 'P', projectPath: '/p' }, createdAt: new Date().toISOString() } as const;
    broadcastJobStatus(job);
    expect(mockBroadcast).toHaveBeenCalledOnce();
    expect(mockBroadcast).toHaveBeenCalledWith(DISPATCH_STATUS_CHANNEL, job);
  });

  it('broadcasts on every call — no deduplication', async () => {
    const { broadcastJobStatus } = await import('./sessionDispatchRunnerStatus');
    const job = { id: 'j2', status: 'completed', request: { title: 'T', prompt: 'P', projectPath: '/p' }, createdAt: new Date().toISOString() } as const;
    broadcastJobStatus(job);
    broadcastJobStatus(job);
    expect(mockBroadcast).toHaveBeenCalledTimes(2);
  });

  it('DISPATCH_STATUS_CHANNEL is the expected string', async () => {
    const { DISPATCH_STATUS_CHANNEL } = await import('./sessionDispatchRunnerStatus');
    expect(DISPATCH_STATUS_CHANNEL).toBe('sessionDispatch:status');
  });
});
