import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock telemetry to avoid real DB/batcher timers in tests.
const { mockEnqueueTrace } = vi.hoisted(() => ({
  mockEnqueueTrace: vi.fn(),
}));

vi.mock('../../telemetry/traceBatcher', () => ({
  enqueueTrace: mockEnqueueTrace,
  redactArgv: (argv: string[]) => argv,
  redactHead: (s: string) => s,
}));
vi.mock('../../telemetry', () => ({
  getOutcomeObserver: () => ({ appendStderr: vi.fn() }),
}));
vi.mock('../../ptyEnv', () => ({
  buildBaseEnv: (extraEnv?: Record<string, string>) => ({
    OUROBOROS_IDE_SESSION: '1',
    ...extraEnv,
  }),
}));

// child_process mock — must come before importing the module under test.
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
  pid = 99001;
  kill() {
    /* no-op */
  }
}

let fakeChild: FakeChildProcess;

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: () => fakeChild as unknown as ReturnType<typeof actual.spawn>,
    exec: vi.fn(),
  };
});

import { spawnWarmStreamJsonProcess } from './claudeWarmStreamJsonRunner';

function sendStdout(data: string) {
  fakeChild.stdout.emit('data', Buffer.from(data));
}

describe('spawnWarmStreamJsonProcess', () => {
  beforeEach(() => {
    fakeChild = new FakeChildProcess();
    mockEnqueueTrace.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a handle with the child pid', () => {
    const handle = spawnWarmStreamJsonProcess({ cwd: '/tmp/test' });
    expect(handle.pid).toBe(99001);
  });

  it('does NOT close stdin after construction (warm mode)', () => {
    spawnWarmStreamJsonProcess({ cwd: '/tmp/test' });
    expect(fakeChild.stdin.ended).toBe(false);
  });

  it('writes NDJSON user message to stdin on sendTurn', () => {
    const handle = spawnWarmStreamJsonProcess({ cwd: '/tmp/test' });
    void handle.sendTurn('hello warm', () => {});
    expect(fakeChild.stdin.written).toHaveLength(1);
    const parsed = JSON.parse(fakeChild.stdin.written[0]!);
    expect(parsed).toMatchObject({
      type: 'user',
      message: { role: 'user', content: 'hello warm' },
    });
  });

  it('resolves sendTurn promise when result event arrives', async () => {
    const handle = spawnWarmStreamJsonProcess({ cwd: '/tmp/test' });
    const events: unknown[] = [];
    const turnPromise = handle.sendTurn('ping', (e) => events.push(e));

    sendStdout('{"type":"system","subtype":"init","session_id":"warm-sess-1"}\n');
    sendStdout('{"type":"result","subtype":"success","is_error":false,"result":"pong"}\n');

    const result = await turnPromise;
    expect(result.subtype).toBe('success');
    expect(result.result).toBe('pong');
    expect(handle.sessionId).toBe('warm-sess-1');
  });

  it('captures session_id from first event carrying one', async () => {
    const handle = spawnWarmStreamJsonProcess({ cwd: '/tmp/test' });
    const turnPromise = handle.sendTurn('hi', () => {});
    sendStdout('{"type":"system","subtype":"init","session_id":"sid-42"}\n');
    sendStdout('{"type":"result","subtype":"success","is_error":false,"result":""}\n');
    await turnPromise;
    expect(handle.sessionId).toBe('sid-42');
  });

  it('forwards non-result events to the onEvent callback', async () => {
    const handle = spawnWarmStreamJsonProcess({ cwd: '/tmp/test' });
    const seen: string[] = [];
    const turnPromise = handle.sendTurn('task', (e) => seen.push(e.type));
    sendStdout('{"type":"system","subtype":"init","session_id":"s"}\n');
    sendStdout('{"type":"assistant","message":{"role":"assistant","content":[]}}\n');
    sendStdout('{"type":"result","subtype":"success","is_error":false,"result":""}\n');
    await turnPromise;
    expect(seen).toContain('system');
    expect(seen).toContain('assistant');
    expect(seen).toContain('result');
  });

  it('supports a second turn on the same process (same pid)', async () => {
    const handle = spawnWarmStreamJsonProcess({ cwd: '/tmp/test' });

    const t1 = handle.sendTurn('turn one', () => {});
    sendStdout('{"type":"result","subtype":"success","is_error":false,"result":"r1"}\n');
    const r1 = await t1;
    expect(r1.result).toBe('r1');
    expect(fakeChild.stdin.ended).toBe(false);

    const t2 = handle.sendTurn('turn two', () => {});
    sendStdout('{"type":"result","subtype":"success","is_error":false,"result":"r2"}\n');
    const r2 = await t2;
    expect(r2.result).toBe('r2');
    // Same process — pid must not change
    expect(handle.pid).toBe(99001);
  });

  it('injectUserMessage writes to stdin when a turn is active', () => {
    const handle = spawnWarmStreamJsonProcess({ cwd: '/tmp/test' });
    void handle.sendTurn('start', () => {});
    handle.injectUserMessage('inject me');
    // First write is the sendTurn message; second is the injection
    expect(fakeChild.stdin.written).toHaveLength(2);
    const injected = JSON.parse(fakeChild.stdin.written[1]!);
    expect(injected).toMatchObject({
      type: 'user',
      message: { role: 'user', content: 'inject me' },
    });
  });

  it('injectUserMessage warns and drops when no active turn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handle = spawnWarmStreamJsonProcess({ cwd: '/tmp/test' });
    handle.injectUserMessage('nobody home');
    expect(fakeChild.stdin.written).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it('rejects active turn when process exits unexpectedly', async () => {
    const handle = spawnWarmStreamJsonProcess({ cwd: '/tmp/test' });
    const turnPromise = handle.sendTurn('hi', () => {});
    fakeChild.emit('exit', 1);
    await expect(turnPromise).rejects.toThrow('Warm process exited unexpectedly');
  });

  it('calls onExit callback when process exits', () => {
    const onExit = vi.fn();
    spawnWarmStreamJsonProcess({ cwd: '/tmp/test', onExit });
    fakeChild.emit('exit', 0);
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('emits a spawn trace on construction', () => {
    mockEnqueueTrace.mockClear();
    spawnWarmStreamJsonProcess({ cwd: '/tmp/test', telemetrySessionId: 'warm-trace-1' });
    const spawnCall = mockEnqueueTrace.mock.calls.find((c) => c[0].kind === 'spawn');
    expect(spawnCall).toBeDefined();
    expect(spawnCall![0]).toMatchObject({ kind: 'spawn', sessionId: 'warm-trace-1' });
  });
});
