/**
 * mergeSideChat.test.ts — Wave 23 Phase D
 * Unit tests for mergeSideChatIntoMain.
 */
import { describe, expect, it, vi } from 'vitest';

import type { ThreadStoreLike } from './mergeSideChat';
import { mergeSideChatIntoMain } from './mergeSideChat';
import type { AgentChatMessageRecord, AgentChatThreadRecord } from './types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeThread(
  overrides: Partial<AgentChatThreadRecord> & { id: string },
): AgentChatThreadRecord {
  return {
    version: 1,
    workspaceRoot: '/work',
    createdAt: 1000,
    updatedAt: 1000,
    title: 'My Thread',
    status: 'idle',
    messages: [],
    ...overrides,
  } as AgentChatThreadRecord;
}

function makeMsg(
  overrides: Partial<AgentChatMessageRecord> & { id: string },
): AgentChatMessageRecord {
  return {
    threadId: 'side-1',
    role: 'user',
    content: 'hello',
    createdAt: 1000,
    ...overrides,
  } as AgentChatMessageRecord;
}

function makeStore(
  threads: AgentChatThreadRecord[],
): ThreadStoreLike & { appendSingleMessage: ReturnType<typeof vi.fn> } {
  const map = new Map(threads.map((t) => [t.id, t]));
  const appendSingleMessage = vi.fn().mockResolvedValue(undefined);
  return {
    requireThread: (id) => {
      const t = map.get(id);
      if (!t) return Promise.reject(new Error(`Thread not found: ${id}`));
      return Promise.resolve(t);
    },
    appendSingleMessage,
    readThread: (id) => Promise.resolve(map.get(id) ?? null),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('mergeSideChatIntoMain', () => {
  it('appends a system-role message to the main thread', async () => {
    const sideChat = makeThread({ id: 'side-1', title: 'Side chat: exploration' });
    const mainThread = makeThread({ id: 'main-1' });
    const store = makeStore([sideChat, mainThread]);

    const result = await mergeSideChatIntoMain(
      { sideChatId: 'side-1', mainThreadId: 'main-1', summary: 'Key findings here.' },
      store,
      { createId: () => 'new-msg-id', now: () => 2000 },
    );

    expect(result.success).toBe(true);
    expect(result.systemMessageId).toBe('new-msg-id');
    expect(store.appendSingleMessage).toHaveBeenCalledOnce();

    const [, msg] = store.appendSingleMessage.mock.calls[0] as [
      AgentChatThreadRecord,
      AgentChatMessageRecord,
    ];
    expect(msg.role).toBe('system');
    expect(msg.threadId).toBe('main-1');
    expect(msg.content).toContain('## Side chat summary');
    expect(msg.content).toContain('Key findings here.');
  });

  it('includes the branch name in the heading when set', async () => {
    const sideChat = makeThread({ id: 'side-1', title: 'Side chat: foo', branchName: 'my-branch' });
    const mainThread = makeThread({ id: 'main-1' });
    const store = makeStore([sideChat, mainThread]);

    const result = await mergeSideChatIntoMain(
      { sideChatId: 'side-1', mainThreadId: 'main-1', summary: 'Summary.' },
      store,
    );

    expect(result.success).toBe(true);
    const [, msg] = store.appendSingleMessage.mock.calls[0] as [unknown, AgentChatMessageRecord];
    expect(msg.content).toContain('from my-branch');
  });

  it('falls back to thread title when branchName is not set', async () => {
    const sideChat = makeThread({ id: 'side-1', title: 'Side chat: bar' });
    const mainThread = makeThread({ id: 'main-1' });
    const store = makeStore([sideChat, mainThread]);

    await mergeSideChatIntoMain(
      { sideChatId: 'side-1', mainThreadId: 'main-1', summary: 'Summary.' },
      store,
    );

    const [, msg] = store.appendSingleMessage.mock.calls[0] as [unknown, AgentChatMessageRecord];
    expect(msg.content).toContain('from Side chat: bar');
  });

  it('inlines selected messages under "Included messages" when includeMessageIds provided', async () => {
    const msg1 = makeMsg({ id: 'msg-a', role: 'user', content: 'User question' });
    const msg2 = makeMsg({ id: 'msg-b', role: 'assistant', content: 'Assistant answer' });
    const sideChat = makeThread({ id: 'side-1', messages: [msg1, msg2] });
    const mainThread = makeThread({ id: 'main-1' });
    const store = makeStore([sideChat, mainThread]);

    await mergeSideChatIntoMain(
      {
        sideChatId: 'side-1',
        mainThreadId: 'main-1',
        summary: 'Summary.',
        includeMessageIds: ['msg-b'],
      },
      store,
    );

    const [, msg] = store.appendSingleMessage.mock.calls[0] as [unknown, AgentChatMessageRecord];
    expect(msg.content).toContain('### Included messages');
    expect(msg.content).toContain('Assistant answer');
    expect(msg.content).not.toContain('User question');
  });

  it('does not add included messages section when includeMessageIds is empty', async () => {
    const sideChat = makeThread({ id: 'side-1' });
    const mainThread = makeThread({ id: 'main-1' });
    const store = makeStore([sideChat, mainThread]);

    await mergeSideChatIntoMain(
      {
        sideChatId: 'side-1',
        mainThreadId: 'main-1',
        summary: 'Summary.',
        includeMessageIds: [],
      },
      store,
    );

    const [, msg] = store.appendSingleMessage.mock.calls[0] as [unknown, AgentChatMessageRecord];
    expect(msg.content).not.toContain('### Included messages');
  });

  it('allows multiple merges — each appends a new system message', async () => {
    const sideChat = makeThread({ id: 'side-1' });
    const mainThread = makeThread({ id: 'main-1' });
    const store = makeStore([sideChat, mainThread]);

    await mergeSideChatIntoMain(
      { sideChatId: 'side-1', mainThreadId: 'main-1', summary: 'First merge.' },
      store,
    );
    await mergeSideChatIntoMain(
      { sideChatId: 'side-1', mainThreadId: 'main-1', summary: 'Second merge.' },
      store,
    );

    expect(store.appendSingleMessage).toHaveBeenCalledTimes(2);
  });

  it('returns { success: false } when side chat thread not found', async () => {
    const mainThread = makeThread({ id: 'main-1' });
    const store = makeStore([mainThread]);

    const result = await mergeSideChatIntoMain(
      { sideChatId: 'missing', mainThreadId: 'main-1', summary: 'Summary.' },
      store,
    ).catch((err: unknown) => ({ success: false, error: String(err) }));

    expect(result.success).toBe(false);
  });

  it('returns { success: false } when main thread not found', async () => {
    const sideChat = makeThread({ id: 'side-1' });
    const store = makeStore([sideChat]);

    const result = await mergeSideChatIntoMain(
      { sideChatId: 'side-1', mainThreadId: 'missing', summary: 'Summary.' },
      store,
    ).catch((err: unknown) => ({ success: false, error: String(err) }));

    expect(result.success).toBe(false);
  });
});
