/**
 * threadStoreOps.test.ts — Wave 23 Phase D
 * Unit tests for the mutation helpers extracted from threadStore.ts.
 */
import { describe, expect, it, vi } from 'vitest';

import { appendMessageToThread, updateThreadMessage, updateThreadRecord } from './threadStoreOps';
import type { AgentChatMessageRecord, AgentChatThreadRecord } from './types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeThread(overrides: Partial<AgentChatThreadRecord> & { id: string }): AgentChatThreadRecord {
  return {
    version: 1,
    workspaceRoot: '/work',
    createdAt: 1000,
    updatedAt: 1000,
    title: 'Test Thread',
    status: 'idle',
    messages: [],
    ...overrides,
  } as AgentChatThreadRecord;
}

function makeMsg(overrides: Partial<AgentChatMessageRecord> & { id: string }): AgentChatMessageRecord {
  return {
    threadId: 'thread-1',
    role: 'user',
    content: 'hello',
    createdAt: 1000,
    ...overrides,
  } as AgentChatMessageRecord;
}

function makeRuntime(thread: AgentChatThreadRecord) {
  const written: AgentChatThreadRecord[] = [];
  const appended: AgentChatMessageRecord[] = [];
  return {
    requireThread: vi.fn().mockResolvedValue(thread),
    writeThread: vi.fn().mockImplementation((t: AgentChatThreadRecord) => {
      written.push(t);
      return Promise.resolve(t);
    }),
    appendSingleMessage: vi.fn().mockImplementation((_t: unknown, msg: AgentChatMessageRecord) => {
      appended.push(msg);
      return Promise.resolve();
    }),
    updateThreadMetadataOnly: vi.fn().mockResolvedValue(null),
    written,
    appended,
  };
}

// ── updateThreadRecord ────────────────────────────────────────────────────────

describe('updateThreadRecord', () => {
  it('falls back to writeThread when updateThreadMetadataOnly returns null', async () => {
    const thread = makeThread({ id: 'thread-1' });
    const runtime = makeRuntime(thread);
    const now = () => 2000;

    await updateThreadRecord({
      now,
      patch: { status: 'running' },
      runtime: runtime as never,
      threadId: 'thread-1',
    });

    expect(runtime.writeThread).toHaveBeenCalledOnce();
    const saved = runtime.written[0];
    expect(saved.status).toBe('running');
    expect(saved.updatedAt).toBe(2000);
  });

  it('returns the result from updateThreadMetadataOnly when non-null', async () => {
    const thread = makeThread({ id: 'thread-1' });
    const runtime = makeRuntime(thread);
    const updated = { ...thread, status: 'idle' as const, updatedAt: 3000 };
    runtime.updateThreadMetadataOnly.mockResolvedValue(updated);

    const result = await updateThreadRecord({
      now: () => 3000,
      patch: { title: 'New title' },
      runtime: runtime as never,
      threadId: 'thread-1',
    });

    expect(result).toBe(updated);
    expect(runtime.writeThread).not.toHaveBeenCalled();
  });
});

// ── updateThreadMessage ───────────────────────────────────────────────────────

describe('updateThreadMessage', () => {
  it('throws when messageId is provided but not found', async () => {
    const thread = makeThread({ id: 'thread-1' });
    const runtime = makeRuntime(thread);

    await expect(
      updateThreadMessage({
        messageId: 'missing-id',
        messagePatch: { content: 'updated' },
        now: () => 2000,
        runtime: runtime as never,
        threadId: 'thread-1',
      }),
    ).rejects.toThrow('Chat message not found: missing-id');
  });

  it('upserts an existing message', async () => {
    const msg = makeMsg({ id: 'msg-1', content: 'original' });
    const thread = makeThread({ id: 'thread-1', messages: [msg] });
    const runtime = makeRuntime(thread);

    await updateThreadMessage({
      messageId: 'msg-1',
      messagePatch: { content: 'updated' },
      now: () => 2000,
      runtime: runtime as never,
      threadId: 'thread-1',
    });

    expect(runtime.writeThread).toHaveBeenCalledOnce();
    const saved = runtime.written[0];
    const savedMsg = saved.messages.find((m) => m.id === 'msg-1');
    expect(savedMsg?.content).toBe('updated');
  });
});

// ── appendMessageToThread ─────────────────────────────────────────────────────

describe('appendMessageToThread', () => {
  it('appends message and calls appendSingleMessage', async () => {
    const thread = makeThread({ id: 'thread-1' });
    const runtime = makeRuntime(thread);
    const msg = makeMsg({ id: 'msg-new', content: 'new message' });

    const result = await appendMessageToThread({
      now: () => 2000,
      runtime: runtime as never,
      threadId: 'thread-1',
      message: msg,
    });

    expect(runtime.appendSingleMessage).toHaveBeenCalledOnce();
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].id).toBe('msg-new');
  });

  it('normalizes threadId on appended message', async () => {
    const thread = makeThread({ id: 'thread-1' });
    const runtime = makeRuntime(thread);
    const msg = makeMsg({ id: 'msg-2', threadId: 'wrong-thread' });

    await appendMessageToThread({
      now: () => 2000,
      runtime: runtime as never,
      threadId: 'thread-1',
      message: msg,
    });

    const appended = runtime.appended[0];
    expect(appended.threadId).toBe('thread-1');
  });
});
