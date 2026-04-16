import { describe, expect, it, vi } from 'vitest';

import type { AgentChatService } from '../agentChat';
import type { AgentChatMessageRecord, AgentChatThreadRecord } from '../agentChat/types';
import { registerExportImportHandlers } from './agentChatExportImport';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeThread(overrides: Partial<AgentChatThreadRecord> = {}): AgentChatThreadRecord {
  return {
    version: 1,
    id: 'thread-1',
    workspaceRoot: '/proj',
    createdAt: 1700000000000,
    updatedAt: 1700000100000,
    title: 'Export Test',
    status: 'idle',
    messages: [],
    tags: ['ts'],
    ...overrides,
  };
}

function makeMsg(overrides: Partial<AgentChatMessageRecord> = {}): AgentChatMessageRecord {
  return {
    id: 'msg-1',
    threadId: 'thread-1',
    role: 'user',
    content: 'hello',
    createdAt: 1700000010000,
    ...overrides,
  };
}

/** Minimal requireValidString stub — throws on empty, returns string otherwise. */
function requireStr(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`Invalid ${name}`);
  return value.trim();
}

/** Captures handler registrations so tests can invoke them directly. */
function makeRegisterCapture() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const register = (
    channels: string[],
    channel: string,
    handler: (...args: unknown[]) => unknown,
  ) => {
    channels.push(channel);
    handlers.set(channel, handler);
  };
  const invoke = (channel: string, ...args: unknown[]) => {
    const h = handlers.get(channel);
    if (!h) throw new Error(`No handler for ${channel}`);
    return h(...args);
  };
  return { register, invoke, handlers };
}

/** Build a minimal mock AgentChatService for these tests. */
function makeSvc(
  thread: AgentChatThreadRecord | null = makeThread(),
): Pick<AgentChatService, 'loadThread' | 'threadStore'> {
  return {
    loadThread: vi.fn().mockResolvedValue(
      thread
        ? { success: true, thread }
        : { success: false, error: 'Thread not found' },
    ),
    threadStore: {
      createThread: vi.fn().mockResolvedValue(makeThread({ id: 'new-thread-id' })),
      setTags: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentChatService['threadStore'],
  } as unknown as AgentChatService;
}

// ─── registerExportImportHandlers ─────────────────────────────────────────────

describe('registerExportImportHandlers', () => {
  it('registers exportThread and importThread channels', () => {
    const { register } = makeRegisterCapture();
    const channels: string[] = [];
    registerExportImportHandlers({
      channels, svc: makeSvc() as AgentChatService, register, requireValidString: requireStr,
      exportChannel: 'agentChat:exportThread', importChannel: 'agentChat:importThread',
    });
    expect(channels).toContain('agentChat:exportThread');
    expect(channels).toContain('agentChat:importThread');
  });
});

// ─── exportThread handler ─────────────────────────────────────────────────────

describe('exportThread handler', () => {
  function setup(thread: AgentChatThreadRecord | null = makeThread()) {
    const cap = makeRegisterCapture();
    const channels: string[] = [];
    const svc = makeSvc(thread);
    registerExportImportHandlers({
      channels, svc: svc as AgentChatService, register: cap.register,
      requireValidString: requireStr,
      exportChannel: 'agentChat:exportThread', importChannel: 'agentChat:importThread',
    });
    const invoke = (...args: unknown[]) => cap.invoke('agentChat:exportThread', ...args);
    return { invoke, svc };
  }

  it('returns success:false for invalid format', async () => {
    const { invoke } = setup();
    const r = await invoke('thread-1', 'pdf') as { success: boolean; error: string };
    expect(r.success).toBe(false);
    expect(r.error).toContain('Invalid format');
  });

  it('returns success:false when thread not found', async () => {
    const { invoke } = setup(null);
    const r = await invoke('thread-1', 'markdown') as { success: boolean; error: string };
    expect(r.success).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('returns markdown content for markdown format', async () => {
    const thread = makeThread({ messages: [makeMsg()] });
    const { invoke } = setup(thread);
    const r = await invoke('thread-1', 'markdown') as { success: boolean; content: string };
    expect(r.success).toBe(true);
    expect(r.content).toContain('# Thread:');
  });

  it('returns JSON content for json format', async () => {
    const thread = makeThread({ messages: [makeMsg()] });
    const { invoke } = setup(thread);
    const r = await invoke('thread-1', 'json') as { success: boolean; content: string };
    expect(r.success).toBe(true);
    expect(() => JSON.parse(r.content)).not.toThrow();
    expect(JSON.parse(r.content).thread.title).toBe('Export Test');
  });

  it('returns HTML content for html format', async () => {
    const thread = makeThread({ messages: [makeMsg()] });
    const { invoke } = setup(thread);
    const r = await invoke('thread-1', 'html') as { success: boolean; content: string };
    expect(r.success).toBe(true);
    expect(r.content).toContain('<!DOCTYPE html>');
  });

  it('throws when threadId is missing', async () => {
    const { invoke } = setup();
    await expect(invoke('', 'markdown')).rejects.toThrow();
  });
});

// ─── importThread handler ─────────────────────────────────────────────────────

describe('importThread handler', () => {
  function setup() {
    const cap = makeRegisterCapture();
    const channels: string[] = [];
    const svc = makeSvc();
    registerExportImportHandlers({
      channels, svc: svc as AgentChatService, register: cap.register,
      requireValidString: requireStr,
      exportChannel: 'agentChat:exportThread', importChannel: 'agentChat:importThread',
    });
    const invoke = (...args: unknown[]) => cap.invoke('agentChat:importThread', ...args);
    return { invoke, svc };
  }

  it('returns success:false for invalid format', async () => {
    const { invoke } = setup();
    const r = await invoke('{}', 'csv') as { success: boolean; error: string };
    expect(r.success).toBe(false);
    expect(r.error).toContain('Invalid format');
  });

  it('returns success:false for malformed JSON', async () => {
    const { invoke } = setup();
    const r = await invoke('not-json', 'json') as { success: boolean; error: string };
    expect(r.success).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('returns success:false for transcript with no role markers', async () => {
    const { invoke } = setup();
    const r = await invoke('plain text no markers', 'transcript') as { success: boolean };
    expect(r.success).toBe(false);
  });

  it('returns success:true and threadId for valid JSON import', async () => {
    const { invoke } = setup();
    const validJson = JSON.stringify({
      thread: { id: 'orig', title: 'Imported' },
      messages: [{ role: 'user', content: 'hi' }],
    });
    const r = await invoke(validJson, 'json') as { success: boolean; threadId: string };
    expect(r.success).toBe(true);
    expect(typeof r.threadId).toBe('string');
    expect(r.threadId).toBeTruthy();
  });

  it('returns success:true for valid transcript import', async () => {
    const { invoke } = setup();
    const transcript = [
      '## [user] at 2023-01-01T00:00:00Z',
      'Hello there',
      '## [assistant] at 2023-01-01T00:00:01Z',
      'Hi back',
    ].join('\n');
    const r = await invoke(transcript, 'transcript') as { success: boolean; threadId: string };
    expect(r.success).toBe(true);
    expect(r.threadId).toBeTruthy();
  });

  it('calls threadStore.setTags when imported thread has tags', async () => {
    const { invoke, svc } = setup();
    const validJson = JSON.stringify({
      thread: { id: 'orig', title: 'Tagged', tags: ['typescript', 'refactor'] },
      messages: [],
    });
    await invoke(validJson, 'json');
    expect(svc.threadStore.setTags).toHaveBeenCalledWith(
      'new-thread-id',
      ['typescript', 'refactor'],
    );
  });

  it('skips setTags when imported thread has no tags', async () => {
    const { invoke, svc } = setup();
    const validJson = JSON.stringify({
      thread: { id: 'orig', title: 'No Tags' },
      messages: [],
    });
    await invoke(validJson, 'json');
    expect(svc.threadStore.setTags).not.toHaveBeenCalled();
  });
});
