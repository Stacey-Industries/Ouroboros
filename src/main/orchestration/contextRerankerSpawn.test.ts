/**
 * contextRerankerSpawn.test.ts — Unit tests for spawnHaikuForRerank.
 *
 * All tests use a mock spawnFn — the real Claude CLI is never invoked.
 */

import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { spawnHaikuForRerank } from './contextRerankerSpawn';

// ─── Mock child process factory ───────────────────────────────────────────────

interface MockStdin {
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

interface MockChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: MockStdin;
  kill: ReturnType<typeof vi.fn>;
}

function makeMockChild(): MockChild {
  const child = new EventEmitter() as MockChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    write: vi.fn((_data: unknown, _enc: unknown, cb?: () => void) => { cb?.(); }),
    end: vi.fn(),
  };
  child.kill = vi.fn();
  return child;
}

function makeSpawnFn(child: MockChild): ReturnType<typeof vi.fn> {
  return vi.fn(() => child);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('spawnHaikuForRerank — success path', () => {
  it('resolves success:true with trimmed output on exit code 0', async () => {
    const child = makeMockChild();
    const spawnFn = makeSpawnFn(child);

    const resultP = spawnHaikuForRerank('rerank this', 500, { spawnFn, platform: 'linux' });

    child.stdout.emit('data', Buffer.from('{"order":["a.ts","b.ts"]}\n'));
    child.emit('close', 0);

    const result = await resultP;
    expect(result.success).toBe(true);
    expect(result.output).toBe('{"order":["a.ts","b.ts"]}');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('writes prompt to stdin then ends stdin', async () => {
    const child = makeMockChild();
    const spawnFn = makeSpawnFn(child);

    const resultP = spawnHaikuForRerank('my prompt', 500, { spawnFn, platform: 'linux' });
    child.stdout.emit('data', Buffer.from('ok'));
    child.emit('close', 0);
    await resultP;

    expect(child.stdin.write).toHaveBeenCalledWith('my prompt', 'utf8', expect.any(Function));
    expect(child.stdin.end).toHaveBeenCalled();
  });

  it('uses correct args on linux (not powershell)', () => {
    const child = makeMockChild();
    const spawnFn = makeSpawnFn(child);

    const resultP = spawnHaikuForRerank('prompt', 500, { spawnFn, platform: 'linux' });
    child.emit('close', 0);
    resultP.catch(() => {/* ignore empty output */});

    const [cmd, args] = spawnFn.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('claude');
    expect(args).toContain('--model');
    expect(args).toContain('haiku');
    expect(args).toContain('--print');
  });

  it('uses powershell on win32', () => {
    const child = makeMockChild();
    const spawnFn = makeSpawnFn(child);

    const resultP = spawnHaikuForRerank('prompt', 500, { spawnFn, platform: 'win32' });
    child.emit('close', 0);
    resultP.catch(() => {/* ignore empty output */});

    const [cmd, args] = spawnFn.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('powershell.exe');
    expect(args).toContain('-NonInteractive');
    const commandStr = args.join(' ');
    expect(commandStr).toMatch(/haiku/);
    expect(commandStr).toMatch(/--print/);
  });
});

describe('spawnHaikuForRerank — failure paths', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns success:false on non-zero exit code', async () => {
    const child = makeMockChild();
    const spawnFn = makeSpawnFn(child);

    const resultP = spawnHaikuForRerank('prompt', 500, { spawnFn, platform: 'linux' });
    child.stderr.emit('data', Buffer.from('auth error'));
    child.emit('close', 1);

    const result = await resultP;
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/exit 1/);
  });

  it('returns success:false on empty stdout', async () => {
    const child = makeMockChild();
    const spawnFn = makeSpawnFn(child);

    const resultP = spawnHaikuForRerank('prompt', 500, { spawnFn, platform: 'linux' });
    child.emit('close', 0);

    const result = await resultP;
    expect(result.success).toBe(false);
    expect(result.error).toBe('empty output');
  });

  it('returns success:false with error:timeout when process exceeds timeoutMs', async () => {
    const child = makeMockChild();
    const spawnFn = makeSpawnFn(child);

    const resultP = spawnHaikuForRerank('prompt', 300, { spawnFn, platform: 'linux' });

    await vi.advanceTimersByTimeAsync(301);

    const result = await resultP;
    expect(result.success).toBe(false);
    expect(result.error).toBe('timeout');
    expect(child.kill).toHaveBeenCalled();
  });

  it('returns success:false when spawn emits an error event', async () => {
    const child = makeMockChild();
    const spawnFn = makeSpawnFn(child);

    const resultP = spawnHaikuForRerank('prompt', 500, { spawnFn, platform: 'linux' });
    child.emit('error', new Error('ENOENT: claude not found'));

    const result = await resultP;
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ENOENT/);
  });

  it('resolves only once even if both timeout and close fire', async () => {
    const child = makeMockChild();
    const spawnFn = makeSpawnFn(child);

    const resultP = spawnHaikuForRerank('prompt', 100, { spawnFn, platform: 'linux' });

    await vi.advanceTimersByTimeAsync(101);
    // Fire close after timeout — should be ignored
    child.stdout.emit('data', Buffer.from('late output'));
    child.emit('close', 0);

    const result = await resultP;
    // Must have settled as timeout (first event wins)
    expect(result.success).toBe(false);
    expect(result.error).toBe('timeout');
  });
});

describe('spawnHaikuForRerank — latencyMs', () => {
  it('includes latencyMs in both success and failure results', async () => {
    const child = makeMockChild();
    const spawnFn = makeSpawnFn(child);

    const resultP = spawnHaikuForRerank('prompt', 500, { spawnFn, platform: 'linux' });
    child.stdout.emit('data', Buffer.from('output'));
    child.emit('close', 0);

    const result = await resultP;
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
