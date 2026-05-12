/**
 * crashRecovery.test.ts — Unit tests for the Wave 86 Phase 5 crash-recovery scan.
 *
 * Tests:
 *   - no-ops when no threads have interrupted status
 *   - sets lastInterruptedAt and resets status to idle for stranded threads
 *   - synthesizes tool_result for dangling tool_use blocks
 *   - does NOT synthesize when tool_result already present in a later user message
 *   - tolerates a single thread failure without aborting recovery for others
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatPersistenceLayer } from './chatPersistenceLayer';
import { reconcileInterruptedThreads } from './crashRecovery';
import type { AgentChatThreadStore } from './threadStore';
import type { AgentChatContentBlock, AgentChatMessageRecord, AgentChatThreadRecord } from './types';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeThread(
  id: string,
  status: AgentChatThreadRecord['status'],
  messages: AgentChatMessageRecord[] = [],
): AgentChatThreadRecord {
  return {
    version: 1,
    id,
    workspaceRoot: '/tmp',
    createdAt: 1000,
    updatedAt: 1000,
    title: 'Test thread',
    status,
    messages,
  };
}

function makeAssistantMsg(
  threadId: string,
  blocks: AgentChatContentBlock[],
): AgentChatMessageRecord {
  return {
    id: `${threadId}:assistant`,
    threadId,
    role: 'assistant',
    content: '',
    blocks,
    createdAt: 2000,
  };
}

function makeUserMsg(threadId: string, blocks: AgentChatContentBlock[]): AgentChatMessageRecord {
  return {
    id: `${threadId}:user`,
    threadId,
    role: 'user',
    content: '',
    blocks,
    createdAt: 3000,
  };
}

const TOOL_USE_BLOCK: AgentChatContentBlock = {
  kind: 'tool_use',
  tool: 'Read',
  blockId: 'b-1',
  status: 'running',
};

// ─── Mock factories ───────────────────────────────────────────────────────────

function makeMockStore(threads: AgentChatThreadRecord[]): AgentChatThreadStore {
  return {
    listThreads: vi.fn().mockResolvedValue(threads),
    updateThread: vi.fn().mockImplementation(async (id, patch) => ({
      ...threads.find((t) => t.id === id)!,
      ...patch,
    })),
    appendMessage: vi.fn().mockResolvedValue({}),
    // unused methods — type-cast remainder
  } as unknown as AgentChatThreadStore;
}

function makeMockPersistence(): ChatPersistenceLayer {
  return {
    setLastInterruptedAt: vi.fn(),
  } as unknown as ChatPersistenceLayer;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('reconcileInterruptedThreads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no-ops when all threads are in terminal status', async () => {
    const store = makeMockStore([
      makeThread('t-1', 'idle'),
      makeThread('t-2', 'complete'),
      makeThread('t-3', 'failed'),
    ]);
    const persistence = makeMockPersistence();

    await reconcileInterruptedThreads(store, persistence);

    expect(persistence.setLastInterruptedAt).not.toHaveBeenCalled();
    expect(store.updateThread).not.toHaveBeenCalled();
  });

  it('sets lastInterruptedAt and resets status to idle for running threads', async () => {
    const threads = [makeThread('t-running', 'running'), makeThread('t-idle', 'idle')];
    const store = makeMockStore(threads);
    const persistence = makeMockPersistence();

    await reconcileInterruptedThreads(store, persistence);

    expect(persistence.setLastInterruptedAt).toHaveBeenCalledOnce();
    expect(persistence.setLastInterruptedAt).toHaveBeenCalledWith('t-running', expect.any(Number));
    expect(store.updateThread).toHaveBeenCalledWith('t-running', { status: 'idle' });
    expect(store.updateThread).not.toHaveBeenCalledWith('t-idle', expect.anything());
  });

  it('handles submitting status the same as running', async () => {
    const store = makeMockStore([makeThread('t-sub', 'submitting')]);
    const persistence = makeMockPersistence();

    await reconcileInterruptedThreads(store, persistence);

    expect(persistence.setLastInterruptedAt).toHaveBeenCalledWith('t-sub', expect.any(Number));
    expect(store.updateThread).toHaveBeenCalledWith('t-sub', { status: 'idle' });
  });

  it('synthesizes tool_result for dangling tool_use in last assistant message', async () => {
    const assistantMsg = makeAssistantMsg('t-1', [TOOL_USE_BLOCK]);
    const thread = makeThread('t-1', 'running', [assistantMsg]);
    const store = makeMockStore([thread]);
    const persistence = makeMockPersistence();

    await reconcileInterruptedThreads(store, persistence);

    expect(store.appendMessage).toHaveBeenCalledOnce();
    const [calledThreadId, msg] = (store.appendMessage as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, AgentChatMessageRecord];
    expect(calledThreadId).toBe('t-1');
    expect(msg.role).toBe('user');
    const toolResultBlocks = (msg.blocks ?? []).filter((b) => b.kind === 'tool_result');
    expect(toolResultBlocks).toHaveLength(1);
    expect(
      (toolResultBlocks[0] as Extract<AgentChatContentBlock, { kind: 'tool_result' }>).toolUseId,
    ).toBe('b-1');
    expect(
      (toolResultBlocks[0] as Extract<AgentChatContentBlock, { kind: 'tool_result' }>).content,
    ).toBe('[interrupted]');
  });

  it('does NOT synthesize when tool_result already exists in a later user message', async () => {
    const assistantMsg = makeAssistantMsg('t-1', [TOOL_USE_BLOCK]);
    const toolResultBlock: AgentChatContentBlock = {
      kind: 'tool_result',
      toolUseId: 'b-1',
      content: 'ok',
    };
    const userMsg = makeUserMsg('t-1', [toolResultBlock]);
    const thread = makeThread('t-1', 'running', [assistantMsg, userMsg]);
    const store = makeMockStore([thread]);
    const persistence = makeMockPersistence();

    await reconcileInterruptedThreads(store, persistence);

    expect(store.appendMessage).not.toHaveBeenCalled();
  });

  it('does NOT synthesize when last assistant message has no blocks', async () => {
    const assistantMsg = makeAssistantMsg('t-1', []);
    const thread = makeThread('t-1', 'running', [assistantMsg]);
    const store = makeMockStore([thread]);
    const persistence = makeMockPersistence();

    await reconcileInterruptedThreads(store, persistence);

    expect(store.appendMessage).not.toHaveBeenCalled();
  });

  it('continues recovering other threads when one thread fails', async () => {
    const threads = [makeThread('t-bad', 'running'), makeThread('t-good', 'running')];
    const store = {
      listThreads: vi.fn().mockResolvedValue(threads),
      updateThread: vi.fn().mockImplementation(async (id: string) => {
        if (id === 't-bad') throw new Error('db write failed');
        return threads.find((t) => t.id === id);
      }),
      appendMessage: vi.fn().mockResolvedValue({}),
    } as unknown as AgentChatThreadStore;
    const persistence = makeMockPersistence();

    // Should not throw
    await expect(reconcileInterruptedThreads(store, persistence)).resolves.toBeUndefined();

    // t-good should still have been processed
    expect(store.updateThread).toHaveBeenCalledWith('t-good', { status: 'idle' });
  });
});
