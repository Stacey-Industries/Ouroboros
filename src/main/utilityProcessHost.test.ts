/**
 * utilityProcessHost.test.ts — Unit tests for the generic UtilityProcessHost wrapper.
 *
 * Mocks Electron's utilityProcess.fork() with a stub that records messages
 * and exposes hooks for simulating responses, exits, and crashes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock electron.utilityProcess ──

interface FakeChild {
  pid: number;
  postMessage: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  on: (event: string, cb: (...args: unknown[]) => void) => FakeChild;
  /** Test helper — simulate a message arriving from the child */
  emitMessage: (msg: unknown) => void;
  /** Test helper — simulate the child exiting */
  emitExit: (code: number) => void;
}

const createdChildren: FakeChild[] = [];

function createFakeChild(): FakeChild {
  let messageCb: ((msg: unknown) => void) | null = null;
  let exitCb: ((code: number) => void) | null = null;
  const child: FakeChild = {
    pid: Math.floor(Math.random() * 100000) + 1,
    postMessage: vi.fn(),
    kill: vi.fn(),
    on: (event, cb) => {
      if (event === 'message') messageCb = cb as (msg: unknown) => void;
      if (event === 'exit') exitCb = cb as (code: number) => void;
      return child;
    },
    emitMessage: (msg) => { messageCb?.(msg); },
    emitExit: (code) => { exitCb?.(code); },
  };
  return child;
}

vi.mock('electron', () => ({
  utilityProcess: {
    fork: vi.fn(() => {
      const child = createFakeChild();
      createdChildren.push(child);
      return child;
    }),
  },
}));

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Imports (after mocks) ──

import { UtilityProcessHost } from './utilityProcessHost';

// ── Test types ──

interface TestRequest { type: string; requestId?: string; payload?: unknown }
interface TestOutbound { type: string; requestId?: string; payload?: unknown; message?: string }

// ── Tests ──

beforeEach(() => {
  createdChildren.length = 0;
});

afterEach(() => {
  vi.clearAllTimers();
});

function makeHost(options: Partial<{ autoRestart: boolean; onCrash: (c: number) => void }> = {}) {
  return new UtilityProcessHost<TestRequest, TestOutbound>({
    name: 'test-host',
    modulePath: '/fake/path/to/module.js',
    autoRestart: options.autoRestart ?? false,
    ...(options.onCrash ? { onCrash: options.onCrash } : {}),
  });
}

describe('UtilityProcessHost', () => {
  describe('lifecycle', () => {
    it('forks a child process on fork()', () => {
      const host = makeHost();
      host.fork();
      expect(createdChildren).toHaveLength(1);
      expect(host.alive).toBe(true);
      expect(host.pid).toBe(createdChildren[0]!.pid);
    });

    it('does not double-fork', () => {
      const host = makeHost();
      host.fork();
      host.fork();
      expect(createdChildren).toHaveLength(1);
    });

    it('kill() terminates the child', async () => {
      const host = makeHost();
      host.fork();
      const child = createdChildren[0]!;
      await host.kill();
      expect(child.kill).toHaveBeenCalled();
      expect(host.alive).toBe(false);
    });
  });

  describe('messaging', () => {
    it('send() forwards a message to the child', () => {
      const host = makeHost();
      host.fork();
      host.send({ type: 'ping' });
      expect(createdChildren[0]!.postMessage).toHaveBeenCalledWith({ type: 'ping' });
    });

    it('send() before fork is silent (logs warning)', () => {
      const host = makeHost();
      // Should not throw
      host.send({ type: 'early' });
      expect(createdChildren).toHaveLength(0);
    });
  });

  describe('request/response correlation', () => {
    it('resolves a request when a matching response arrives', async () => {
      const host = makeHost();
      host.fork();
      const requestId = host.nextRequestId();
      const promise = host.request<TestOutbound>({ type: 'getThing', requestId });
      // Simulate child responding with the same requestId
      createdChildren[0]!.emitMessage({ type: 'thing', requestId, payload: 'hello' });
      const result = await promise;
      expect(result.type).toBe('thing');
      expect(result.payload).toBe('hello');
    });

    it('rejects with the error message for type=error responses', async () => {
      const host = makeHost();
      host.fork();
      const requestId = host.nextRequestId();
      const promise = host.request<TestOutbound>({ type: 'doThing', requestId });
      createdChildren[0]!.emitMessage({ type: 'error', requestId, message: 'something failed' });
      await expect(promise).rejects.toThrow('something failed');
    });

    it('generates unique request IDs', () => {
      const host = makeHost();
      const id1 = host.nextRequestId();
      const id2 = host.nextRequestId();
      expect(id1).not.toBe(id2);
    });

    it('rejects pending requests when child exits', async () => {
      const host = makeHost({ autoRestart: false });
      host.fork();
      const promise = host.request<TestOutbound>({ type: 'doThing', requestId: 'r1' });
      createdChildren[0]!.emitExit(1);
      await expect(promise).rejects.toThrow(/exited|killed/);
    });
  });

  describe('event subscription', () => {
    it('forwards push events (no requestId) to onEvent handlers', () => {
      const host = makeHost();
      host.fork();
      const handler = vi.fn();
      host.onEvent(handler);
      createdChildren[0]!.emitMessage({ type: 'data', payload: 'streamed' });
      expect(handler).toHaveBeenCalledWith({ type: 'data', payload: 'streamed' });
    });

    it('does NOT forward responses (with requestId) to event handlers', () => {
      const host = makeHost();
      host.fork();
      const handler = vi.fn();
      host.onEvent(handler);
      // First start a request so the requestId is in the pending map
      void host.request({ type: 'doThing', requestId: 'r1' });
      createdChildren[0]!.emitMessage({ type: 'response', requestId: 'r1' });
      expect(handler).not.toHaveBeenCalled();
    });

    it('onEvent returns an unsubscribe function', () => {
      const host = makeHost();
      host.fork();
      const handler = vi.fn();
      const unsubscribe = host.onEvent(handler);
      unsubscribe();
      createdChildren[0]!.emitMessage({ type: 'data' });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('crash handling', () => {
    it('calls onCrash when child exits unexpectedly', () => {
      const onCrash = vi.fn();
      const host = makeHost({ onCrash });
      host.fork();
      createdChildren[0]!.emitExit(137);
      expect(onCrash).toHaveBeenCalledWith(137);
    });

    it('does NOT call onCrash on intentional kill()', async () => {
      const onCrash = vi.fn();
      const host = makeHost({ onCrash });
      host.fork();
      await host.kill();
      // Simulate the child's exit event firing AFTER kill (some platforms do this)
      createdChildren[0]!.emitExit(0);
      expect(onCrash).not.toHaveBeenCalled();
    });

    it('auto-restarts the child when autoRestart is true', () => {
      const host = makeHost({ autoRestart: true });
      host.fork();
      createdChildren[0]!.emitExit(1);
      // After auto-restart, a second child should exist
      expect(createdChildren).toHaveLength(2);
    });

    it('does NOT auto-restart when autoRestart is false', () => {
      const host = makeHost({ autoRestart: false });
      host.fork();
      createdChildren[0]!.emitExit(1);
      expect(createdChildren).toHaveLength(1);
    });

    it('crash handler errors do not block auto-restart', () => {
      const onCrash = vi.fn(() => { throw new Error('handler bug'); });
      const host = makeHost({ autoRestart: true, onCrash });
      host.fork();
      createdChildren[0]!.emitExit(1);
      // Auto-restart should still fire
      expect(createdChildren).toHaveLength(2);
    });
  });

  describe('message envelope handling', () => {
    it('unwraps { data: ... } MessageEvent envelopes', () => {
      const host = makeHost();
      host.fork();
      const handler = vi.fn();
      host.onEvent(handler);
      // Some Electron environments wrap the message in a MessageEvent { data }
      createdChildren[0]!.emitMessage({ data: { type: 'wrapped' } });
      expect(handler).toHaveBeenCalledWith({ type: 'wrapped' });
    });

    it('ignores non-object messages', () => {
      const host = makeHost();
      host.fork();
      const handler = vi.fn();
      host.onEvent(handler);
      createdChildren[0]!.emitMessage('a string');
      createdChildren[0]!.emitMessage(42);
      createdChildren[0]!.emitMessage(null);
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
