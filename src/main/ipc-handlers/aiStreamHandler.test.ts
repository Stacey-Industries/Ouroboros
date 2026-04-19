/**
 * aiStreamHandler — unit tests
 *
 * Mocks child_process.spawn and asserts that webContents.send is called
 * with the correct InlineEditStreamEvent shapes during token streaming.
 */
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
}));

vi.mock('../config', () => ({
  getConfigValue: vi.fn((key: string) => {
    if (key === 'defaultProjectRoot') return '/tmp/project';
    return null;
  }),
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../orchestration/providers/claudeStreamJsonRunner', () => ({
  buildStreamJsonArgs: vi.fn(() => ({ command: 'claude', args: ['-p', '--output-format', 'stream-json'] })),
}));

// ── Child process capture ─────────────────────────────────────────────────────
// Use a shared container so the mock factory and tests share the same reference.

class MockChildProcess extends EventEmitter {
  stdin = { write: vi.fn(), end: vi.fn() };
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  pid = 12345;
  kill = vi.fn();
}

const spawnState = { lastChild: null as MockChildProcess | null };

vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    const child = new MockChildProcess();
    spawnState.lastChild = child;
    return child;
  }),
  exec: vi.fn((_cmd: string, _opts: unknown, cb: () => void) => { if (cb) cb(); }),
}));

// ── Imports under test ────────────────────────────────────────────────────────

import {
  handleCancelInlineEditStream,
  handleStreamInlineEdit,
} from './aiStreamHandler';

// ── Test helpers ──────────────────────────────────────────────────────────────

type SendCapture = [string, unknown];

function makeMockEvent(sends: SendCapture[]) {
  const sender = {
    send: vi.fn((channel: string, payload: unknown) => { sends.push([channel, payload]); }),
    isDestroyed: () => false,
  };
  return { sender } as unknown as Electron.IpcMainInvokeEvent;
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    requestId: 'req-001',
    filePath: '/tmp/project/file.ts',
    instruction: 'rename x to y',
    selectedText: 'const x = 1;',
    range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 14 },
    prefix: 'const x = 1;\n',
    suffix: '',
    ...overrides,
  };
}

function getCurrentChild(): MockChildProcess {
  const child = spawnState.lastChild;
  if (!child) throw new Error('No child process was spawned');
  return child;
}

function emitLine(line: object) {
  getCurrentChild().stdout.emit('data', Buffer.from(JSON.stringify(line) + '\n'));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('handleStreamInlineEdit', () => {
  let sends: SendCapture[];

  beforeEach(() => {
    sends = [];
    spawnState.lastChild = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spawns claude process and resolves success', async () => {
    const event = makeMockEvent(sends);
    const req = makeRequest();
    const resultPromise = handleStreamInlineEdit(event, req);

    // Give the handler time to register stdout listeners
    await Promise.resolve();

    emitLine({ type: 'result', subtype: 'success', is_error: false, result: 'const y = 1;' });
    getCurrentChild().emit('close', 0);

    const result = await resultPromise;
    expect(result.success).toBe(true);
  });

  it('emits token events for assistant text content', async () => {
    const event = makeMockEvent(sends);
    const req = makeRequest();
    const resultPromise = handleStreamInlineEdit(event, req);

    await Promise.resolve();

    emitLine({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    });
    emitLine({ type: 'result', subtype: 'success', is_error: false, result: 'hello' });
    getCurrentChild().emit('close', 0);

    await resultPromise;

    const tokens = sends.filter(
      ([ch, p]) => ch === 'ai:inlineEditStream:req-001' && (p as { type: string }).type === 'token',
    );
    expect(tokens.length).toBeGreaterThan(0);
    expect((tokens[0][1] as { delta: string }).delta).toBe('hello');
  });

  it('emits incremental deltas as assistant text grows', async () => {
    const event = makeMockEvent(sends);
    const req = makeRequest();
    const resultPromise = handleStreamInlineEdit(event, req);

    await Promise.resolve();

    emitLine({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    });
    emitLine({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello world' }] },
    });
    emitLine({ type: 'result', subtype: 'success', is_error: false, result: 'hello world' });
    getCurrentChild().emit('close', 0);

    await resultPromise;

    const tokens = sends
      .filter(([ch, p]) =>
        ch === 'ai:inlineEditStream:req-001' && (p as { type: string }).type === 'token',
      )
      .map(([, p]) => (p as { delta: string }).delta);

    expect(tokens).toContain('hello');
    expect(tokens).toContain(' world');
  });

  it('emits done event after successful close', async () => {
    const event = makeMockEvent(sends);
    const req = makeRequest();
    const resultPromise = handleStreamInlineEdit(event, req);

    await Promise.resolve();

    emitLine({ type: 'result', subtype: 'success', is_error: false, result: 'const y = 1;' });
    getCurrentChild().emit('close', 0);

    await resultPromise;

    const doneEvents = sends.filter(
      ([ch, p]) => ch === 'ai:inlineEditStream:req-001' && (p as { type: string }).type === 'done',
    );
    expect(doneEvents.length).toBe(1);
  });

  it('emits error event on non-zero exit code', async () => {
    const event = makeMockEvent(sends);
    const req = makeRequest();
    const resultPromise = handleStreamInlineEdit(event, req);

    await Promise.resolve();

    getCurrentChild().stderr.emit('data', Buffer.from('claude error'));
    getCurrentChild().emit('close', 1);

    await resultPromise;

    const errorEvents = sends.filter(
      ([ch, p]) => ch === 'ai:inlineEditStream:req-001' && (p as { type: string }).type === 'error',
    );
    expect(errorEvents.length).toBe(1);
  });

  it('handleCancelInlineEditStream kills the tracked process', async () => {
    const event = makeMockEvent(sends);
    const req = makeRequest();

    // Start without awaiting so process stays alive
    const streamPromise = handleStreamInlineEdit(event, req);
    await Promise.resolve();

    const child = getCurrentChild();

    const cancelEvent = makeMockEvent(sends);
    const cancelResult = await handleCancelInlineEditStream(cancelEvent, { requestId: 'req-001' });

    expect(cancelResult.success).toBe(true);
    // On non-Windows, kill('SIGTERM') is called
    expect(child.kill).toHaveBeenCalled();

    // Clean up: trigger close so promise resolves
    child.emit('close', null);
    await streamPromise;
  });
});
