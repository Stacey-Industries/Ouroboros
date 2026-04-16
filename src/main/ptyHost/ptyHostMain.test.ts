/**
 * ptyHostMain.test.ts — Unit tests for the PtyHost message dispatcher.
 *
 * Mocks node-pty at the spawn boundary so tests run without a real terminal.
 * Mocks process.parentPort.postMessage to capture outbound messages.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────

interface MockProc {
  pid: number;
  cols: number;
  rows: number;
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  onData: (cb: (data: string) => void) => { dispose: () => void };
  onExit: (cb: (e: { exitCode: number; signal: number }) => void) => { dispose: () => void };
  /** Test helper — invoke the registered onData listener */
  emitData: (data: string) => void;
  /** Test helper — invoke the registered onExit listener */
  emitExit: (exitCode: number, signal: number) => void;
}

const procFactories: MockProc[] = [];

function createMockProc(): MockProc {
  let dataCb: ((data: string) => void) | null = null;
  let exitCb: ((e: { exitCode: number; signal: number }) => void) | null = null;
  const proc: MockProc = {
    pid: 12345,
    cols: 80,
    rows: 24,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: (cb) => {
      dataCb = cb;
      return { dispose: () => { dataCb = null; } };
    },
    onExit: (cb) => {
      exitCb = cb;
      return { dispose: () => { exitCb = null; } };
    },
    emitData: (data) => { dataCb?.(data); },
    emitExit: (exitCode, signal) => { exitCb?.({ exitCode, signal }); },
  };
  return proc;
}

vi.mock('../ptyPersistence', () => ({
  createPtyPersistence: vi.fn(() => ({
    isEnabled: vi.fn(() => false),
    saveSession: vi.fn(),
    updateSession: vi.fn(),
    removeSession: vi.fn(),
    listSessions: vi.fn(() => []),
    clearAll: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => {
    const proc = createMockProc();
    procFactories.push(proc);
    return proc;
  }),
}));

// ── Capture outbound messages ──

interface OutboundMessage {
  type: string;
  requestId?: string;
  id?: string;
  data?: string;
  pid?: number;
  cwd?: string;
  list?: unknown[];
  state?: unknown;
  exitCode?: number;
  signal?: number;
  message?: string;
}

const postedMessages: OutboundMessage[] = [];

beforeEach(() => {
  // Mock process.parentPort BEFORE the module is imported.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process as any).parentPort = {
    postMessage: (msg: OutboundMessage) => { postedMessages.push(msg); },
    on: vi.fn(),
  };
  postedMessages.length = 0;
  procFactories.length = 0;
});

afterEach(async () => {
  // Reset session state between tests
  const mod = await import('./ptyHostMain');
  mod._resetForTests();
});

// ── Test helpers ──

async function importDispatcher() {
  const mod = await import('./ptyHostMain');
  return mod.dispatch;
}

function findResponse(requestId: string): OutboundMessage | undefined {
  return postedMessages.find((m) => m.requestId === requestId);
}

function findEvents(type: string): OutboundMessage[] {
  return postedMessages.filter((m) => m.type === type);
}

function makeSpawnInstruction(id: string) {
  return {
    id, shell: '/bin/bash', args: [], env: { TERM: 'xterm-256color' },
    cwd: '/tmp', cols: 80, rows: 24, windowId: 1,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('ptyHostMain dispatcher', () => {
  describe('spawn', () => {
    it('spawns a session and posts a spawned response', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'spawn', requestId: 'r1', instruction: makeSpawnInstruction('s1') });
      const res = findResponse('r1');
      expect(res?.type).toBe('spawned');
      expect(res?.id).toBe('s1');
      expect(res?.pid).toBe(12345);
    });

    it('rejects duplicate session id', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'spawn', requestId: 'r1', instruction: makeSpawnInstruction('s1') });
      postedMessages.length = 0;
      dispatch({ type: 'spawn', requestId: 'r2', instruction: makeSpawnInstruction('s1') });
      const res = findResponse('r2');
      expect(res?.type).toBe('error');
      expect(res?.message).toContain('already exists');
    });
  });

  describe('data + exit events', () => {
    it('forwards data events to parentPort', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'spawn', requestId: 'r1', instruction: makeSpawnInstruction('s1') });
      procFactories[0]!.emitData('hello world');
      const events = findEvents('data');
      expect(events).toHaveLength(1);
      expect(events[0]!.id).toBe('s1');
      expect(events[0]!.data).toBe('hello world');
    });

    it('forwards exit events and removes session', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'spawn', requestId: 'r1', instruction: makeSpawnInstruction('s1') });
      procFactories[0]!.emitExit(0, 0);
      const exitEvents = findEvents('exit');
      expect(exitEvents).toHaveLength(1);
      expect(exitEvents[0]!.id).toBe('s1');
      expect(exitEvents[0]!.exitCode).toBe(0);
      // Session should be gone — listSessions returns empty
      postedMessages.length = 0;
      dispatch({ type: 'listSessions', requestId: 'r2' });
      const res = findResponse('r2');
      expect(res?.list).toHaveLength(0);
    });
  });

  describe('write / resize / kill', () => {
    it('write forwards to proc.write', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'spawn', requestId: 'r1', instruction: makeSpawnInstruction('s1') });
      dispatch({ type: 'write', id: 's1', data: 'echo hi\n' });
      expect(procFactories[0]!.write).toHaveBeenCalledWith('echo hi\n');
    });

    it('resize forwards to proc.resize', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'spawn', requestId: 'r1', instruction: makeSpawnInstruction('s1') });
      dispatch({ type: 'resize', id: 's1', cols: 120, rows: 40 });
      expect(procFactories[0]!.resize).toHaveBeenCalledWith(120, 40);
    });

    it('kill terminates proc and posts killed response', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'spawn', requestId: 'r1', instruction: makeSpawnInstruction('s1') });
      postedMessages.length = 0;
      dispatch({ type: 'kill', requestId: 'r2', id: 's1' });
      expect(procFactories[0]!.kill).toHaveBeenCalled();
      const res = findResponse('r2');
      expect(res?.type).toBe('killed');
    });

    it('kill of unknown session returns killed response anyway', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'kill', requestId: 'r1', id: 'nonexistent' });
      const res = findResponse('r1');
      expect(res?.type).toBe('killed');
    });

    it('write to unknown session is silent', async () => {
      const dispatch = await importDispatcher();
      // Should not throw
      dispatch({ type: 'write', id: 'nonexistent', data: 'x' });
      expect(postedMessages).toHaveLength(0);
    });
  });

  describe('listSessions', () => {
    it('returns empty list initially', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'listSessions', requestId: 'r1' });
      const res = findResponse('r1');
      expect(res?.list).toEqual([]);
    });

    it('returns active sessions with cwd and windowId', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'spawn', requestId: 'r1', instruction: makeSpawnInstruction('s1') });
      dispatch({ type: 'spawn', requestId: 'r2', instruction: { ...makeSpawnInstruction('s2'), cwd: '/home' } });
      dispatch({ type: 'listSessions', requestId: 'r3' });
      const res = findResponse('r3');
      const list = res?.list as Array<{ id: string; cwd: string; windowId: number }>;
      expect(list).toHaveLength(2);
      expect(list.find((s) => s.id === 's1')?.cwd).toBe('/tmp');
      expect(list.find((s) => s.id === 's2')?.cwd).toBe('/home');
    });
  });

  describe('killAll / killForWindow', () => {
    it('killAll kills every session', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'spawn', requestId: 'r1', instruction: makeSpawnInstruction('s1') });
      dispatch({ type: 'spawn', requestId: 'r2', instruction: makeSpawnInstruction('s2') });
      postedMessages.length = 0;
      dispatch({ type: 'killAll', requestId: 'r3' });
      expect(procFactories[0]!.kill).toHaveBeenCalled();
      expect(procFactories[1]!.kill).toHaveBeenCalled();
      const res = findResponse('r3');
      expect(res?.type).toBe('killAllDone');
    });

    it('killForWindow kills only matching sessions', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'spawn', requestId: 'r1', instruction: { ...makeSpawnInstruction('s1'), windowId: 1 } });
      dispatch({ type: 'spawn', requestId: 'r2', instruction: { ...makeSpawnInstruction('s2'), windowId: 2 } });
      postedMessages.length = 0;
      dispatch({ type: 'killForWindow', requestId: 'r3', windowId: 1 });
      expect(procFactories[0]!.kill).toHaveBeenCalled();
      expect(procFactories[1]!.kill).not.toHaveBeenCalled();
      const res = findResponse('r3');
      expect(res?.type).toBe('killForWindowDone');
    });
  });

  describe('shellState', () => {
    it('returns null state for missing session', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'getShellState', requestId: 'r1', id: 'nope' });
      const res = findResponse('r1');
      expect(res?.type).toBe('shellState');
      expect(res?.state).toBeNull();
    });

    it('returns initial state for active session', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'spawn', requestId: 'r1', instruction: { ...makeSpawnInstruction('s1'), cwd: '/etc' } });
      dispatch({ type: 'getShellState', requestId: 'r2', id: 's1' });
      const res = findResponse('r2');
      const state = res?.state as { cwd: string; isExecuting: boolean } | null;
      expect(state?.cwd).toBe('/etc');
      expect(state?.isExecuting).toBe(false);
    });
  });
});
