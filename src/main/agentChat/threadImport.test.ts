import { describe, expect, it } from 'vitest';

import { exportToJson } from './threadExport';
import { importFromJson, importFromTranscript } from './threadImport';
import type { AgentChatMessageRecord, AgentChatThreadRecord } from './types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeThread(overrides: Partial<AgentChatThreadRecord> = {}): AgentChatThreadRecord {
  return {
    version: 1,
    id: 'thread-orig',
    workspaceRoot: '/home/user/project',
    createdAt: 1700000000000,
    updatedAt: 1700000100000,
    title: 'Original Thread',
    status: 'idle',
    messages: [],
    tags: ['auto:typescript', 'refactor'],
    ...overrides,
  };
}

function makeMessage(
  overrides: Partial<AgentChatMessageRecord> = {},
): AgentChatMessageRecord {
  return {
    id: 'msg-orig-1',
    threadId: 'thread-orig',
    role: 'user',
    content: 'Hello from fixture',
    createdAt: 1700000010000,
    ...overrides,
  };
}

// ─── importFromJson ───────────────────────────────────────────────────────────

describe('importFromJson', () => {
  it('returns null for invalid JSON', () => {
    expect(importFromJson('not json')).toBeNull();
    expect(importFromJson('')).toBeNull();
    expect(importFromJson('{broken')).toBeNull();
  });

  it('returns null when thread.id is missing', () => {
    const bad = JSON.stringify({ thread: { title: 'x' }, messages: [] });
    expect(importFromJson(bad)).toBeNull();
  });

  it('returns null when messages is missing', () => {
    const bad = JSON.stringify({ thread: { id: 'abc' } });
    expect(importFromJson(bad)).toBeNull();
  });

  it('returns null for primitive JSON values', () => {
    expect(importFromJson('"string"')).toBeNull();
    expect(importFromJson('42')).toBeNull();
    expect(importFromJson('null')).toBeNull();
  });

  it('returns a thread with a new ID (not the original)', () => {
    const json = exportToJson(makeThread(), [makeMessage()]);
    const result = importFromJson(json);
    expect(result).not.toBeNull();
    expect(result!.thread.id).not.toBe('thread-orig');
  });

  it('preserves thread title', () => {
    const json = exportToJson(makeThread(), []);
    const result = importFromJson(json);
    expect(result!.thread.title).toBe('Original Thread');
  });

  it('preserves tags', () => {
    const json = exportToJson(makeThread(), []);
    const result = importFromJson(json);
    expect(result!.thread.tags).toEqual(['auto:typescript', 'refactor']);
  });

  it('assigns new IDs to all messages', () => {
    const msgs = [
      makeMessage({ id: 'msg-orig-1', role: 'user', content: 'Hi' }),
      makeMessage({ id: 'msg-orig-2', role: 'assistant', content: 'Hello', createdAt: 1700000020000 }),
    ];
    const json = exportToJson(makeThread(), msgs);
    const result = importFromJson(json);
    expect(result!.messages).toHaveLength(2);
    expect(result!.messages[0].id).not.toBe('msg-orig-1');
    expect(result!.messages[1].id).not.toBe('msg-orig-2');
    // All message IDs should be unique
    const ids = result!.messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('preserves message roles and content', () => {
    const msgs = [
      makeMessage({ role: 'user', content: 'User says hi' }),
      makeMessage({ id: 'msg-2', role: 'assistant', content: 'Assistant replies', createdAt: 1700000020000 }),
    ];
    const json = exportToJson(makeThread(), msgs);
    const result = importFromJson(json);
    expect(result!.messages[0].role).toBe('user');
    expect(result!.messages[0].content).toBe('User says hi');
    expect(result!.messages[1].role).toBe('assistant');
    expect(result!.messages[1].content).toBe('Assistant replies');
  });

  it('links all messages to the new thread ID', () => {
    const msgs = [makeMessage(), makeMessage({ id: 'msg-2', createdAt: 1700000020000 })];
    const json = exportToJson(makeThread(), msgs);
    const result = importFromJson(json);
    const { thread, messages } = result!;
    for (const m of messages) {
      expect(m.threadId).toBe(thread.id);
    }
  });

  it('filters out messages with invalid roles', () => {
    const payload = {
      thread: { id: 'abc', title: 'T' },
      messages: [
        { id: 'm1', role: 'user', content: 'ok' },
        { id: 'm2', role: 'invalid-role', content: 'bad' },
      ],
    };
    const result = importFromJson(JSON.stringify(payload));
    expect(result!.messages).toHaveLength(1);
    expect(result!.messages[0].content).toBe('ok');
  });

  it('preserves blocks when present', () => {
    const msg = makeMessage({
      blocks: [{ kind: 'text', content: 'block content' }],
    });
    const json = exportToJson(makeThread(), [msg]);
    const result = importFromJson(json);
    expect(result!.messages[0].blocks).toBeDefined();
    expect(result!.messages[0].blocks![0].kind).toBe('text');
  });
});

// ─── importFromTranscript ─────────────────────────────────────────────────────

describe('importFromTranscript', () => {
  it('returns null when no role markers found', () => {
    expect(importFromTranscript('Just some text\nno markers here')).toBeNull();
    expect(importFromTranscript('')).toBeNull();
  });

  it('parses a minimal user/assistant exchange', () => {
    const text = [
      '## [user] at 2023-01-01T00:00:00Z',
      'What is TypeScript?',
      '',
      '## [assistant] at 2023-01-01T00:00:01Z',
      'TypeScript is a typed superset of JavaScript.',
    ].join('\n');

    const result = importFromTranscript(text);
    expect(result).not.toBeNull();
    expect(result!.messages).toHaveLength(2);
    expect(result!.messages[0].role).toBe('user');
    expect(result!.messages[0].content).toContain('What is TypeScript?');
    expect(result!.messages[1].role).toBe('assistant');
    expect(result!.messages[1].content).toContain('TypeScript is a typed superset');
  });

  it('assigns a new thread ID', () => {
    const text = '## [user] at 2023-01-01T00:00:00Z\nHello';
    const result = importFromTranscript(text);
    expect(result!.thread.id).toBeTruthy();
    expect(typeof result!.thread.id).toBe('string');
  });

  it('assigns new unique IDs to all messages', () => {
    const text = [
      '## [user] at 2023-01-01T00:00:00Z',
      'First',
      '## [assistant] at 2023-01-01T00:00:01Z',
      'Second',
      '## [user] at 2023-01-01T00:00:02Z',
      'Third',
    ].join('\n');

    const result = importFromTranscript(text);
    expect(result!.messages).toHaveLength(3);
    const ids = result!.messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('links all messages to the thread ID', () => {
    const text = [
      '## [user] at 2023-01-01T00:00:00Z',
      'Hello',
      '## [assistant] at 2023-01-01T00:00:01Z',
      'Hi',
    ].join('\n');

    const result = importFromTranscript(text);
    const { thread, messages } = result!;
    for (const m of messages) {
      expect(m.threadId).toBe(thread.id);
    }
  });

  it('uses "Imported Transcript" as default title', () => {
    const text = '## [user] at 2023-01-01T00:00:00Z\nHello';
    const result = importFromTranscript(text);
    expect(result!.thread.title).toBe('Imported Transcript');
  });

  it('handles multi-line message content', () => {
    const text = [
      '## [user] at 2023-01-01T00:00:00Z',
      'Line one',
      'Line two',
      'Line three',
    ].join('\n');

    const result = importFromTranscript(text);
    expect(result!.messages[0].content).toContain('Line one');
    expect(result!.messages[0].content).toContain('Line two');
    expect(result!.messages[0].content).toContain('Line three');
  });
});

// ─── Round-trip test: export JSON → import JSON ───────────────────────────────

describe('JSON round-trip', () => {
  it('imported thread/messages match original content (IDs differ)', () => {
    const thread = makeThread();
    const messages: AgentChatMessageRecord[] = [
      makeMessage({ id: 'msg-1', role: 'user', content: 'Round-trip user message' }),
      makeMessage({
        id: 'msg-2',
        role: 'assistant',
        content: 'Round-trip assistant reply',
        createdAt: 1700000020000,
      }),
    ];

    const json = exportToJson(thread, messages);
    const imported = importFromJson(json);

    expect(imported).not.toBeNull();
    const { thread: t, messages: m } = imported!;

    // IDs must differ
    expect(t.id).not.toBe(thread.id);
    expect(m[0].id).not.toBe(messages[0].id);
    expect(m[1].id).not.toBe(messages[1].id);

    // Content must match
    expect(t.title).toBe(thread.title);
    expect(t.tags).toEqual(thread.tags);
    expect(m).toHaveLength(messages.length);
    expect(m[0].role).toBe(messages[0].role);
    expect(m[0].content).toBe(messages[0].content);
    expect(m[1].role).toBe(messages[1].role);
    expect(m[1].content).toBe(messages[1].content);
  });
});
