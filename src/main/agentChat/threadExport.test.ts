import { describe, expect, it } from 'vitest';

import { exportToHtml, exportToJson, exportToMarkdown } from './threadExport';
import type { AgentChatMessageRecord, AgentChatThreadRecord } from './types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeThread(overrides: Partial<AgentChatThreadRecord> = {}): AgentChatThreadRecord {
  return {
    version: 1,
    id: 'thread-abc123',
    workspaceRoot: '/home/user/project',
    createdAt: 1700000000000,
    updatedAt: 1700000100000,
    title: 'Test Thread',
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
    id: 'msg-1',
    threadId: 'thread-abc123',
    role: 'user',
    content: 'Hello world',
    createdAt: 1700000010000,
    ...overrides,
  };
}

// ─── exportToMarkdown ─────────────────────────────────────────────────────────

describe('exportToMarkdown', () => {
  it('includes thread title', () => {
    const result = exportToMarkdown(makeThread(), []);
    expect(result).toContain('# Thread: Test Thread');
  });

  it('includes creation date', () => {
    const result = exportToMarkdown(makeThread(), []);
    expect(result).toContain('Created:');
    expect(result).toContain('2023');
  });

  it('includes tags when present', () => {
    const result = exportToMarkdown(makeThread(), []);
    expect(result).toContain('Tags: auto:typescript, refactor');
  });

  it('omits Tags line when thread has no tags', () => {
    const result = exportToMarkdown(makeThread({ tags: [] }), []);
    expect(result).not.toContain('Tags:');
  });

  it('renders user message with role header', () => {
    const msg = makeMessage({ role: 'user', content: 'What is this?' });
    const result = exportToMarkdown(makeThread(), [msg]);
    expect(result).toContain('## [user] at');
    expect(result).toContain('What is this?');
  });

  it('renders assistant message with role header', () => {
    const msg = makeMessage({ role: 'assistant', content: 'It is a test.', id: 'msg-2' });
    const result = exportToMarkdown(makeThread(), [msg]);
    expect(result).toContain('## [assistant] at');
    expect(result).toContain('It is a test.');
  });

  it('renders tool_use blocks with tool name and input preview', () => {
    const msg = makeMessage({
      role: 'assistant',
      content: '',
      blocks: [
        { kind: 'tool_use', tool: 'Read', input: { path: '/foo.ts' }, status: 'complete' },
      ],
    });
    const result = exportToMarkdown(makeThread(), [msg]);
    expect(result).toContain('[Tool: Read]');
    expect(result).toContain('/foo.ts');
  });

  it('renders code blocks with fenced markdown', () => {
    const msg = makeMessage({
      role: 'assistant',
      content: '',
      blocks: [{ kind: 'code', language: 'ts', content: 'const x = 1;' }],
    });
    const result = exportToMarkdown(makeThread(), [msg]);
    expect(result).toContain('```ts');
    expect(result).toContain('const x = 1;');
  });

  it('uses thread id as title fallback when title is empty', () => {
    const result = exportToMarkdown(makeThread({ title: '' }), []);
    expect(result).toContain('# Thread: thread-abc123');
  });
});

// ─── exportToJson ─────────────────────────────────────────────────────────────

describe('exportToJson', () => {
  it('produces valid JSON', () => {
    const result = exportToJson(makeThread(), [makeMessage()]);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('includes thread id, title, tags', () => {
    const parsed = JSON.parse(exportToJson(makeThread(), []));
    expect(parsed.thread.id).toBe('thread-abc123');
    expect(parsed.thread.title).toBe('Test Thread');
    expect(parsed.thread.tags).toEqual(['auto:typescript', 'refactor']);
  });

  it('encodes dates as ISO strings (no Date objects)', () => {
    const parsed = JSON.parse(exportToJson(makeThread(), []));
    expect(typeof parsed.thread.createdAt).toBe('string');
    expect(parsed.thread.createdAt).toMatch(/^\d{4}-/);
  });

  it('serializes messages array', () => {
    const msgs = [
      makeMessage({ id: 'msg-1', role: 'user', content: 'Hi' }),
      makeMessage({ id: 'msg-2', role: 'assistant', content: 'Hello', createdAt: 1700000020000 }),
    ];
    const parsed = JSON.parse(exportToJson(makeThread(), msgs));
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0].role).toBe('user');
    expect(parsed.messages[1].content).toBe('Hello');
  });

  it('includes blocks in message when present', () => {
    const msg = makeMessage({
      blocks: [{ kind: 'text', content: 'block text' }],
    });
    const parsed = JSON.parse(exportToJson(makeThread(), [msg]));
    expect(parsed.messages[0].blocks).toBeDefined();
    expect(parsed.messages[0].blocks[0].kind).toBe('text');
  });

  it('omits blocks key when message has no blocks', () => {
    const parsed = JSON.parse(exportToJson(makeThread(), [makeMessage()]));
    expect(parsed.messages[0].blocks).toBeUndefined();
  });

  it('pretty-prints with 2-space indent', () => {
    const result = exportToJson(makeThread(), []);
    expect(result).toContain('  "thread"');
  });
});

// ─── exportToHtml ─────────────────────────────────────────────────────────────

describe('exportToHtml', () => {
  it('produces a complete HTML document', () => {
    const result = exportToHtml(makeThread(), []);
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<html');
    expect(result).toContain('</html>');
  });

  it('includes thread title in <title> and heading', () => {
    const result = exportToHtml(makeThread(), []);
    expect(result).toContain('<title>Test Thread</title>');
    expect(result).toContain('Test Thread');
  });

  it('includes inline <style> block', () => {
    const result = exportToHtml(makeThread(), []);
    expect(result).toContain('<style>');
  });

  it('escapes HTML special chars in title', () => {
    const result = exportToHtml(makeThread({ title: '<script>alert(1)</script>' }), []);
    expect(result).not.toContain('<script>alert(1)</script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('renders user messages', () => {
    const msg = makeMessage({ role: 'user', content: 'Hello' });
    const result = exportToHtml(makeThread(), [msg]);
    expect(result).toContain('class="message user"');
    expect(result).toContain('Hello');
  });

  it('renders assistant messages', () => {
    const msg = makeMessage({ role: 'assistant', content: 'Hi there', id: 'msg-2' });
    const result = exportToHtml(makeThread(), [msg]);
    expect(result).toContain('class="message assistant"');
    expect(result).toContain('Hi there');
  });

  it('renders tool_use blocks distinctly', () => {
    const msg = makeMessage({
      role: 'assistant',
      content: '',
      blocks: [{ kind: 'tool_use', tool: 'Bash', input: { command: 'ls' }, status: 'complete' }],
    });
    const result = exportToHtml(makeThread(), [msg]);
    expect(result).toContain('class="tool-block"');
    expect(result).toContain('Bash');
  });
});
