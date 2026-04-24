import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — hoisted so factories can reference them
// ---------------------------------------------------------------------------

class FakeStdin {
  written: string[] = [];
  ended = false;
  write(data: string) {
    this.written.push(data);
    return true;
  }
  end() {
    this.ended = true;
  }
}

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = new FakeStdin();
  pid: number;
  constructor(pid: number) {
    super();
    this.pid = pid;
  }
  kill() {
    /* no-op */
  }
}

let pidCounter = 50000;
let lastChild: FakeChildProcess;

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: () => {
      lastChild = new FakeChildProcess(++pidCounter);
      return lastChild as unknown as ReturnType<typeof actual.spawn>;
    },
    exec: vi.fn(),
  };
});

vi.mock('../../telemetry/traceBatcher', () => ({
  enqueueTrace: vi.fn(),
  redactArgv: (a: string[]) => a,
  redactHead: (s: string) => s,
}));
vi.mock('../../telemetry', () => ({
  getOutcomeObserver: () => ({ appendStderr: vi.fn() }),
}));
vi.mock('../../ptyEnv', () => ({
  buildBaseEnv: (e?: Record<string, string>) => ({ OUROBOROS_IDE_SESSION: '1', ...e }),
}));

import {
  getOrCreateWarm,
  injectWarmUserMessage,
  killAllWarm,
  killWarm,
  sendWarmTurn,
  warmProcessCount,
} from './claudeWarmProcessManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveCurrentTurn(
  data = '{"type":"result","subtype":"success","is_error":false,"result":"ok"}\n',
) {
  lastChild.stdout.emit('data', Buffer.from(data));
}

const SPAWN_OPTS = { cwd: '/tmp/test' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('claudeWarmProcessManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    killAllWarm();
  });

  afterEach(() => {
    killAllWarm();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ---- getOrCreateWarm ----

  it('spawns a new process on first getOrCreateWarm', () => {
    const handle = getOrCreateWarm('thread-1', SPAWN_OPTS);
    expect(handle.pid).toBeGreaterThan(0);
    expect(warmProcessCount()).toBe(1);
  });

  it('returns the same handle on second getOrCreateWarm for same key', () => {
    const h1 = getOrCreateWarm('thread-2', SPAWN_OPTS);
    const h2 = getOrCreateWarm('thread-2', SPAWN_OPTS);
    expect(h1).toBe(h2);
    expect(warmProcessCount()).toBe(1);
  });

  it('spawns separate handles for different keys', () => {
    const h1 = getOrCreateWarm('thread-a', SPAWN_OPTS);
    const h2 = getOrCreateWarm('thread-b', SPAWN_OPTS);
    expect(h1).not.toBe(h2);
    expect(warmProcessCount()).toBe(2);
  });

  // ---- sendWarmTurn + reuse ----

  it('sendWarmTurn resolves when result event arrives', async () => {
    getOrCreateWarm('thread-3', SPAWN_OPTS);
    const turnPromise = sendWarmTurn('thread-3', 'hello', () => {});
    resolveCurrentTurn();
    const result = await turnPromise;
    expect(result.subtype).toBe('success');
  });

  it('second sendWarmTurn reuses the same process pid', async () => {
    const handle = getOrCreateWarm('thread-4', SPAWN_OPTS);
    const pid1 = handle.pid;

    const t1 = sendWarmTurn('thread-4', 'turn 1', () => {});
    resolveCurrentTurn('{"type":"result","subtype":"success","is_error":false,"result":"r1"}\n');
    await t1;

    const t2 = sendWarmTurn('thread-4', 'turn 2', () => {});
    resolveCurrentTurn('{"type":"result","subtype":"success","is_error":false,"result":"r2"}\n');
    await t2;

    expect(handle.pid).toBe(pid1);
  });

  it('sendWarmTurn throws when key is not registered', async () => {
    await expect(sendWarmTurn('no-such-key', 'x', () => {})).rejects.toThrow('no warm process');
  });

  // ---- injectWarmUserMessage ----

  it('injectWarmUserMessage writes to stdin of active process', () => {
    getOrCreateWarm('thread-5', SPAWN_OPTS);
    void sendWarmTurn('thread-5', 'start', () => {});
    injectWarmUserMessage('thread-5', 'inject');
    // stdin.written[0] = sendTurn message; [1] = inject
    expect(lastChild.stdin.written).toHaveLength(2);
  });

  it('injectWarmUserMessage warns when key not registered', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    injectWarmUserMessage('missing-key', 'drop me');
    warnSpy.mockRestore();
    // No throw — just a warn
  });

  // ---- idle-kill timer ----

  it('kills the process after IDLE_KILL_MS with reason idle', () => {
    getOrCreateWarm('thread-idle', SPAWN_OPTS);
    expect(warmProcessCount()).toBe(1);
    vi.advanceTimersByTime(55 * 60 * 1000 + 1);
    expect(warmProcessCount()).toBe(0);
  });

  it('restarting idle timer on sendWarmTurn delays idle kill', async () => {
    getOrCreateWarm('thread-restart', SPAWN_OPTS);

    // Advance partway
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(warmProcessCount()).toBe(1);

    // Activity resets the timer
    const t = sendWarmTurn('thread-restart', 'ping', () => {});
    resolveCurrentTurn();
    await t;

    // Original deadline would have fired, but timer was reset — still alive
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(warmProcessCount()).toBe(1);

    // Now advance past the full TTL from the reset point
    vi.advanceTimersByTime(25 * 60 * 1000 + 1);
    expect(warmProcessCount()).toBe(0);
  });

  // ---- crash recovery ----

  it('removes entry from registry when process exits unexpectedly', async () => {
    getOrCreateWarm('thread-crash', SPAWN_OPTS);
    expect(warmProcessCount()).toBe(1);

    // Simulate unexpected crash — also need to consume the rejected turn if any
    const crashChild = lastChild;
    crashChild.emit('exit', 1);

    // Registry must be cleared synchronously on exit
    expect(warmProcessCount()).toBe(0);
  });

  it('allows re-spawn after crash (getOrCreateWarm creates new process)', async () => {
    getOrCreateWarm('thread-respawn', SPAWN_OPTS);
    const oldPid = lastChild.pid;
    lastChild.emit('exit', 1);

    expect(warmProcessCount()).toBe(0);
    const newHandle = getOrCreateWarm('thread-respawn', SPAWN_OPTS);
    expect(newHandle.pid).not.toBe(oldPid);
    expect(warmProcessCount()).toBe(1);
  });

  // ---- killWarm ----

  it('killWarm removes the entry and cancels idle timer', () => {
    getOrCreateWarm('thread-kill', SPAWN_OPTS);
    expect(warmProcessCount()).toBe(1);
    killWarm('thread-kill', 'test');
    expect(warmProcessCount()).toBe(0);
  });

  it('killWarm is a no-op for unknown keys', () => {
    expect(() => killWarm('ghost', 'test')).not.toThrow();
  });

  // ---- killAllWarm ----

  it('killAllWarm clears all entries', () => {
    getOrCreateWarm('ta', SPAWN_OPTS);
    getOrCreateWarm('tb', SPAWN_OPTS);
    getOrCreateWarm('tc', SPAWN_OPTS);
    expect(warmProcessCount()).toBe(3);
    killAllWarm();
    expect(warmProcessCount()).toBe(0);
  });
});
