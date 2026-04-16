/**
 * threadStoreRerun.test.ts — Wave 22 Phase F
 * Unit tests for reRunFromMessageImpl.
 */
import { describe, expect, it, vi } from 'vitest';

import { reRunFromMessageImpl } from './threadStoreRerun';
import type { AgentChatMessageRecord, AgentChatThreadRecord } from './types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMsg(
  overrides: Partial<AgentChatMessageRecord> & { id: string },
): AgentChatMessageRecord {
  return {
    threadId: 'thread-1',
    role: 'user',
    content: 'hello',
    createdAt: 1000,
    ...overrides,
  } as AgentChatMessageRecord;
}

function makeThread(messages: AgentChatMessageRecord[]): AgentChatThreadRecord {
  return {
    version: 1,
    id: 'thread-1',
    workspaceRoot: '/work',
    createdAt: 1000,
    updatedAt: 1000,
    title: 'My Thread',
    status: 'idle',
    messages,
  } as AgentChatThreadRecord;
}

function makeRuntime(thread: AgentChatThreadRecord) {
  return {
    requireThread: vi.fn().mockResolvedValue(thread),
    writeThread: vi.fn().mockImplementation((t: AgentChatThreadRecord) =>
      Promise.resolve(t),
    ),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('reRunFromMessageImpl', () => {
  it('throws if messageId is not found', async () => {
    const thread = makeThread([makeMsg({ id: 'u1' })]);
    const runtime = makeRuntime(thread);
    await expect(
      reRunFromMessageImpl({
        createId: () => 'new-id',
        now: () => 2000,
        runtime: runtime as never,
        threadId: 'thread-1',
        messageId: 'not-found',
      }),
    ).rejects.toThrow('Message not found');
  });

  it('uses the user message itself when messageId points to a user message', async () => {
    const u1 = makeMsg({ id: 'u1', role: 'user', content: 'do something' });
    const thread = makeThread([u1]);
    const runtime = makeRuntime(thread);

    const result = await reRunFromMessageImpl({
      createId: () => 'new-id',
      now: () => 2000,
      runtime: runtime as never,
      threadId: 'thread-1',
      messageId: 'u1',
    });

    expect(result.userMessage.content).toBe('do something');
    expect(result.userMessage.threadId).toBe('new-id');
    expect(result.branch.messages).toHaveLength(0); // branch before first message
  });

  it('finds the preceding user message when messageId is an assistant reply', async () => {
    const u1 = makeMsg({ id: 'u1', role: 'user', content: 'prompt' });
    const a1 = makeMsg({ id: 'a1', role: 'assistant', content: 'response' });
    const thread = makeThread([u1, a1]);
    const runtime = makeRuntime(thread);

    const result = await reRunFromMessageImpl({
      createId: () => 'new-id',
      now: () => 2000,
      runtime: runtime as never,
      threadId: 'thread-1',
      messageId: 'a1',
    });

    expect(result.userMessage.id).toBe('u1');
    expect(result.userMessage.threadId).toBe('new-id');
  });

  it('throws when there is no user message before the given messageId', async () => {
    const a1 = makeMsg({ id: 'a1', role: 'assistant', content: 'hello' });
    const thread = makeThread([a1]);
    const runtime = makeRuntime(thread);

    await expect(
      reRunFromMessageImpl({
        createId: () => 'new-id',
        now: () => 2000,
        runtime: runtime as never,
        threadId: 'thread-1',
        messageId: 'a1',
      }),
    ).rejects.toThrow('No preceding user message');
  });

  it('sets branchInfo with parentThreadId and correct preview', async () => {
    const u1 = makeMsg({ id: 'u1', role: 'user', content: 'original prompt' });
    const a1 = makeMsg({ id: 'a1', role: 'assistant', content: 'answer' });
    const thread = makeThread([u1, a1]);
    const runtime = makeRuntime(thread);

    const result = await reRunFromMessageImpl({
      createId: () => 'branch-id',
      now: () => 5000,
      runtime: runtime as never,
      threadId: 'thread-1',
      messageId: 'a1',
    });

    expect(result.branch.branchInfo).toBeDefined();
    expect(result.branch.branchInfo?.parentThreadId).toBe('thread-1');
    expect(result.branch.branchInfo?.fromMessagePreview).toBe('original prompt');
  });

  it('sets title to "Re-run of <original title>"', async () => {
    const u1 = makeMsg({ id: 'u1', role: 'user' });
    const thread = makeThread([u1]);
    const runtime = makeRuntime(thread);

    const result = await reRunFromMessageImpl({
      createId: () => 'x',
      now: () => 0,
      runtime: runtime as never,
      threadId: 'thread-1',
      messageId: 'u1',
    });

    expect(result.branch.title).toBe('Re-run of My Thread');
  });

  it('does not repeat "Re-run of" prefix if already present', async () => {
    const u1 = makeMsg({ id: 'u1', role: 'user' });
    const thread = { ...makeThread([u1]), title: 'Re-run of My Thread' };
    const runtime = makeRuntime(thread);

    const result = await reRunFromMessageImpl({
      createId: () => 'x',
      now: () => 0,
      runtime: runtime as never,
      threadId: 'thread-1',
      messageId: 'u1',
    });

    expect(result.branch.title).toBe('Re-run of My Thread');
  });

  it('preserves prior conversation history before the user message', async () => {
    const u0 = makeMsg({ id: 'u0', role: 'user', content: 'first message' });
    const a0 = makeMsg({ id: 'a0', role: 'assistant', content: 'first answer' });
    const u1 = makeMsg({ id: 'u1', role: 'user', content: 'second message' });
    const a1 = makeMsg({ id: 'a1', role: 'assistant', content: 'second answer' });
    const thread = makeThread([u0, a0, u1, a1]);
    const runtime = makeRuntime(thread);

    const result = await reRunFromMessageImpl({
      createId: () => 'branch-id',
      now: () => 2000,
      runtime: runtime as never,
      threadId: 'thread-1',
      messageId: 'a1',
    });

    // Branch should contain [u0, a0] (everything before the re-run user msg u1)
    expect(result.branch.messages).toHaveLength(2);
    expect(result.branch.messages[0].id).toBe('u0');
    expect(result.branch.messages[1].id).toBe('a0');
    expect(result.userMessage.id).toBe('u1');
  });
});
