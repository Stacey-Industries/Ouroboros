/**
 * agentChatWorkspaceSendFlows.test.ts — Smoke tests for the send/stop flow
 * orchestration. Heavy IPC paths are exercised via integration; this file
 * pins the pure-control-flow behavior of `queueOrFail` and `flushPendingResend`.
 */
import { describe, expect, it, vi } from 'vitest';

import type { AgentChatActionArgs } from './agentChatWorkspaceActionHelpers';
import { flushPendingResend, queueOrFail } from './agentChatWorkspaceSendFlows';

function makeArgs(overrides: Partial<AgentChatActionArgs> = {}): AgentChatActionArgs {
  const setError = vi.fn();
  return {
    activeThread: null,
    activeThreadId: 'thread-1',
    draft: '',
    isSending: false,
    pendingUserMessage: null,
    projectRoot: '/proj',
    setActiveThreadId: vi.fn(),
    setDraft: vi.fn(),
    setError,
    setIsSending: vi.fn(),
    setPendingUserMessage: vi.fn(),
    setThreads: vi.fn(),
    ...overrides,
  } as AgentChatActionArgs;
}

describe('queueOrFail', () => {
  it('returns false and surfaces an error when no pendingResendRef is provided', () => {
    const args = makeArgs();
    const ok = queueOrFail(args, { id: 'm1', content: 'x' } as never, 'retry');
    expect(ok).toBe(false);
    expect(args.setError).toHaveBeenCalledWith(expect.stringContaining('still working'));
  });

  it('queues the message and returns true when a ref is available', () => {
    const ref = { current: null } as React.MutableRefObject<{
      message: { id: string; content: string };
      source: 'edit' | 'retry';
    } | null>;
    const args = makeArgs({ pendingResendRef: ref as never });
    const message = { id: 'm1', content: 'x' } as never;
    const ok = queueOrFail(args, message, 'edit');
    expect(ok).toBe(true);
    expect(ref.current).toEqual({ message, source: 'edit' });
  });
});

describe('flushPendingResend', () => {
  it('is a no-op when nothing is queued', async () => {
    const args = makeArgs({
      pendingResendRef: { current: null } as never,
    });
    await flushPendingResend(args);
    expect(args.setError).not.toHaveBeenCalled();
  });
});
