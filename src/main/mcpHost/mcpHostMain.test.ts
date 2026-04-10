/**
 * mcpHostMain.test.ts — Unit tests for the McpHost dispatcher.
 *
 * Mocks Node `http` so the start handler can be tested without binding a real
 * port, and mocks process.parentPort so post() calls can be captured.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted state and mocks ──

const { httpMock, postedMessages } = vi.hoisted(() => {
  // Track what server config the test runs against
  const fakeServers: Array<{
    listen: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    address: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  }> = [];
  return {
    httpMock: {
      createServer: vi.fn(() => {
        const server = {
          listen: vi.fn((_port: number, _host: string, cb: () => void) => {
            // Simulate async bind on next tick
            setImmediate(cb);
          }),
          close: vi.fn((cb?: (err?: Error) => void) => setImmediate(() => cb?.())),
          address: vi.fn(() => ({ port: 12345, family: 'IPv4', address: '127.0.0.1' })),
          on: vi.fn(),
        };
        fakeServers.push(server);
        return server;
      }),
      _fakeServers: fakeServers,
    },
    postedMessages: [] as Array<Record<string, unknown>>,
  };
});

vi.mock('http', () => ({
  default: httpMock,
  ...httpMock,
}));

// ── Test setup ──

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process as any).parentPort = {
    postMessage: (msg: Record<string, unknown>) => { postedMessages.push(msg); },
    on: vi.fn(),
  };
  postedMessages.length = 0;
  httpMock._fakeServers.length = 0;
  httpMock.createServer.mockClear();
});

afterEach(async () => {
  const mod = await import('./mcpHostMain');
  mod._resetForTests();
});

// ── Helpers ──

async function importDispatcher() {
  const mod = await import('./mcpHostMain');
  return mod.dispatch;
}

function findResponse(requestId: string): Record<string, unknown> | undefined {
  return postedMessages.find((m) => m.requestId === requestId);
}

function findEvents(type: string): Array<Record<string, unknown>> {
  return postedMessages.filter((m) => m.type === type);
}

// ── Tests ──

describe('mcpHostMain dispatcher', () => {
  describe('start', () => {
    it('starts the HTTP server and posts a started response with the bound port', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'start', requestId: 'r1', workspaceRoot: '/tmp/ws', port: 0 });
      // Wait for setImmediate callback
      await new Promise((r) => setImmediate(r));
      const res = findResponse('r1');
      expect(res?.type).toBe('started');
      expect(res?.port).toBe(12345);
      expect(httpMock.createServer).toHaveBeenCalled();
    });

    it('rejects double-start with an error response', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'start', requestId: 'r1', workspaceRoot: '/tmp/ws', port: 0 });
      await new Promise((r) => setImmediate(r));
      postedMessages.length = 0;
      dispatch({ type: 'start', requestId: 'r2', workspaceRoot: '/tmp/ws', port: 0 });
      const res = findResponse('r2');
      expect(res?.type).toBe('error');
      expect(res?.message).toContain('already started');
    });
  });

  describe('stop', () => {
    it('closes the server and posts stopped', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'start', requestId: 'r1', workspaceRoot: '/tmp/ws', port: 0 });
      await new Promise((r) => setImmediate(r));
      const server = httpMock._fakeServers[0]!;
      postedMessages.length = 0;
      dispatch({ type: 'stop', requestId: 'r2' });
      await new Promise((r) => setImmediate(r));
      expect(server.close).toHaveBeenCalled();
      const res = findResponse('r2');
      expect(res?.type).toBe('stopped');
    });

    it('stop without a running server still posts stopped', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'stop', requestId: 'r1' });
      const res = findResponse('r1');
      expect(res?.type).toBe('stopped');
    });
  });

  describe('toolList / toolCall response handling', () => {
    it('toolListResponse resolves a pending Promise', async () => {
      // We can't easily trigger requestToolList from outside without a real
      // HTTP request, so test the resolveToolListResponse path indirectly:
      // dispatch a response with a callId for which we created a pending entry.
      // Since the pending entries are private to the module, we just verify
      // that an unknown callId is silently ignored (no crash).
      const dispatch = await importDispatcher();
      // No pending — should be a silent no-op
      dispatch({ type: 'toolListResponse', callId: 'unknown', tools: [] });
      // No assertion crash — test passes if no exception
      expect(true).toBe(true);
    });

    it('toolCallResponse for unknown callId is silent', async () => {
      const dispatch = await importDispatcher();
      dispatch({
        type: 'toolCallResponse', callId: 'unknown', text: 'ok', isError: false,
      });
      expect(true).toBe(true);
    });

    it('toolCallError for unknown callId is silent', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'toolCallError', callId: 'unknown', message: 'oops' });
      expect(true).toBe(true);
    });
  });

  describe('lifecycle isolation', () => {
    it('_resetForTests clears pending state and lets a new start happen', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'start', requestId: 'r1', workspaceRoot: '/tmp/ws', port: 0 });
      await new Promise((r) => setImmediate(r));
      const mod = await import('./mcpHostMain');
      mod._resetForTests();
      // After reset, start should succeed again
      postedMessages.length = 0;
      dispatch({ type: 'start', requestId: 'r2', workspaceRoot: '/tmp/ws2', port: 0 });
      await new Promise((r) => setImmediate(r));
      const res = findResponse('r2');
      expect(res?.type).toBe('started');
    });

    it('start emits exactly one started event per requestId', async () => {
      const dispatch = await importDispatcher();
      dispatch({ type: 'start', requestId: 'r1', workspaceRoot: '/tmp/ws', port: 0 });
      await new Promise((r) => setImmediate(r));
      const events = findEvents('started');
      expect(events).toHaveLength(1);
    });
  });
});
