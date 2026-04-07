import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleJsonRpcMessage } from './webSocketBridge';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../windowManager', () => ({
  getAllActiveWindows: vi.fn(() => []),
}));

// Use vi.hoisted so the Map is created before vi.mock factories run
const mockHandlerRegistry = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
vi.mock('./handlerRegistry', () => ({
  ipcHandlerRegistry: mockHandlerRegistry,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockWs(): { ws: WebSocket; sent: string[] } {
  const sent: string[] = [];
  const ws = {
    readyState: 1, // WebSocket.OPEN
    send: (data: string) => sent.push(data),
  } as unknown as WebSocket;
  return { ws, sent };
}

function parseSent(sent: string[]): unknown {
  expect(sent).toHaveLength(1);
  return JSON.parse(sent[0]);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('handleJsonRpcMessage', () => {
  beforeEach(() => {
    mockHandlerRegistry.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Parse errors ────────────────────────────────────────────────────────────

  describe('parse errors', () => {
    it('sends error -32700 for invalid JSON', () => {
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, 'not valid json {{');
      const response = parseSent(sent);
      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: invalid JSON' },
      });
    });

    it('sends error -32700 for empty string', () => {
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, '');
      const response = parseSent(sent);
      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700 },
      });
    });
  });

  // ── Invalid request ─────────────────────────────────────────────────────────

  describe('invalid request', () => {
    it('sends error -32600 when jsonrpc field is missing', () => {
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ id: 1, method: 'test:method' }));
      const response = parseSent(sent);
      expect(response).toMatchObject({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid JSON-RPC 2.0 request' },
      });
    });

    it('sends error -32600 when jsonrpc is wrong version', () => {
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '1.0', id: 1, method: 'test' }));
      const response = parseSent(sent);
      expect(response).toMatchObject({ error: { code: -32600 } });
    });

    it('sends error -32600 when id is missing', () => {
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', method: 'test:method' }));
      const response = parseSent(sent);
      expect(response).toMatchObject({ error: { code: -32600 } });
    });

    it('sends error -32600 when method is missing', () => {
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: 1 }));
      const response = parseSent(sent);
      expect(response).toMatchObject({ error: { code: -32600 } });
    });

    it('sends error -32600 when method is not a string', () => {
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 42 }));
      const response = parseSent(sent);
      expect(response).toMatchObject({ error: { code: -32600 } });
    });

    it('sends error -32600 when id is not a string or number', () => {
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: [], method: 'test' }));
      const response = parseSent(sent);
      expect(response).toMatchObject({ error: { code: -32600 } });
    });

    it('preserves a partial id in invalid-request response when id is present', () => {
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ id: 5, method: 42 }));
      const response = parseSent(sent) as Record<string, unknown>;
      expect(response).toMatchObject({ error: { code: -32600 } });
      // id comes from the parsed partial object
      expect(response.id).toBe(5);
    });
  });

  // ── Method not found ────────────────────────────────────────────────────────

  describe('method not found', () => {
    it('sends error -32601 when method is not in registry', () => {
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(
        ws,
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'nonexistent:method' }),
      );
      const response = parseSent(sent);
      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32601, message: 'Method not found: nonexistent:method' },
      });
    });

    it('includes available method count in error data', () => {
      mockHandlerRegistry.set('test:one', vi.fn());
      mockHandlerRegistry.set('test:two', vi.fn());
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'missing:method' }));
      const response = parseSent(sent) as { error: { data: { availableMethods: number } } };
      expect(response.error.data.availableMethods).toBe(2);
    });

    it('uses string id in method-not-found response', () => {
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: 'req-abc', method: 'nope' }));
      const response = parseSent(sent) as { id: unknown };
      expect(response.id).toBe('req-abc');
    });
  });

  // ── Successful dispatch ─────────────────────────────────────────────────────

  describe('successful dispatch', () => {
    it('calls registered handler and sends result', async () => {
      mockHandlerRegistry.set('files:read', vi.fn().mockResolvedValue({ content: 'hello' }));
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'files:read' }));
      await new Promise<void>((r) => setTimeout(r, 0));
      const response = parseSent(sent);
      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 10,
        result: { content: 'hello' },
      });
    });

    it('passes params array to handler', async () => {
      const handler = vi.fn().mockResolvedValue('ok');
      mockHandlerRegistry.set('pty:write', handler);
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(
        ws,
        JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'pty:write', params: ['id1', 'data'] }),
      );
      await new Promise<void>((r) => setTimeout(r, 0));
      // First arg is the mock IPC event; rest are params
      expect(handler).toHaveBeenCalledWith(expect.anything(), 'id1', 'data');
      expect(sent).toHaveLength(1);
      const response = JSON.parse(sent[0]) as { result: unknown };
      expect(response.result).toBe('ok');
    });

    it('passes empty params when params is absent', async () => {
      const handler = vi.fn().mockResolvedValue('pong');
      mockHandlerRegistry.set('ping', handler);
      const { ws } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: 12, method: 'ping' }));
      await new Promise<void>((r) => setTimeout(r, 0));
      // Should be called with only the mock event — no extra args
      expect(handler).toHaveBeenCalledWith(expect.anything());
    });

    it('passes empty params when params is not an array', async () => {
      const handler = vi.fn().mockResolvedValue('ok');
      mockHandlerRegistry.set('foo', handler);
      const { ws } = createMockWs();
      handleJsonRpcMessage(
        ws,
        JSON.stringify({ jsonrpc: '2.0', id: 13, method: 'foo', params: { key: 'val' } }),
      );
      await new Promise<void>((r) => setTimeout(r, 0));
      expect(handler).toHaveBeenCalledWith(expect.anything());
    });

    it('handles synchronous handler return value', async () => {
      // Handler returns a non-Promise (Promise.resolve wraps it)
      mockHandlerRegistry.set('sync:method', () => 42);
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: 14, method: 'sync:method' }));
      await new Promise<void>((r) => setTimeout(r, 0));
      const response = parseSent(sent) as { result: unknown };
      expect(response.result).toBe(42);
    });
  });

  // ── Handler error ───────────────────────────────────────────────────────────

  describe('handler error', () => {
    it('sends error -32603 when handler throws', async () => {
      mockHandlerRegistry.set('boom', () => {
        throw new Error('explosion');
      });
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: 20, method: 'boom' }));
      await new Promise<void>((r) => setTimeout(r, 0));
      const response = parseSent(sent);
      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 20,
        error: { code: -32603, message: 'Handler error: explosion' },
      });
    });

    it('sends error -32603 when handler returns rejected promise', async () => {
      mockHandlerRegistry.set('async:boom', () => Promise.reject(new Error('async fail')));
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: 21, method: 'async:boom' }));
      await new Promise<void>((r) => setTimeout(r, 0));
      const response = parseSent(sent);
      expect(response).toMatchObject({
        error: { code: -32603, message: 'Handler error: async fail' },
      });
    });

    it('converts non-Error thrown values to string', async () => {
      mockHandlerRegistry.set('string:throw', () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'plain string error';
      });
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: 22, method: 'string:throw' }));
      await new Promise<void>((r) => setTimeout(r, 0));
      const response = parseSent(sent) as { error: { message: string } };
      expect(response.error.message).toBe('Handler error: plain string error');
    });
  });

  // ── Binary encoding ─────────────────────────────────────────────────────────

  describe('binary encoding', () => {
    it('encodes Buffer result as {__type:"Buffer", data:<base64>}', async () => {
      const buf = Buffer.from('hello world');
      mockHandlerRegistry.set('buf:read', () => buf);
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: 30, method: 'buf:read' }));
      await new Promise<void>((r) => setTimeout(r, 0));
      const response = parseSent(sent) as { result: { __type: string; data: string } };
      expect(response.result).toEqual({
        __type: 'Buffer',
        data: buf.toString('base64'),
      });
    });

    it('encodes Uint8Array result as {__type:"Uint8Array", data:<base64>}', async () => {
      const arr = new Uint8Array([1, 2, 3, 4]);
      mockHandlerRegistry.set('uint8:read', () => arr);
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: 31, method: 'uint8:read' }));
      await new Promise<void>((r) => setTimeout(r, 0));
      const response = parseSent(sent) as { result: { __type: string; data: string } };
      expect(response.result).toEqual({
        __type: 'Uint8Array',
        data: Buffer.from(arr).toString('base64'),
      });
    });

    it('recursively encodes Buffer inside an object', async () => {
      const buf = Buffer.from('nested');
      mockHandlerRegistry.set('obj:read', () => ({ name: 'test', payload: buf }));
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: 32, method: 'obj:read' }));
      await new Promise<void>((r) => setTimeout(r, 0));
      const response = parseSent(sent) as {
        result: { name: string; payload: { __type: string; data: string } };
      };
      expect(response.result.name).toBe('test');
      expect(response.result.payload).toEqual({
        __type: 'Buffer',
        data: buf.toString('base64'),
      });
    });

    it('recursively encodes Buffer inside an array', async () => {
      const buf = Buffer.from('item');
      mockHandlerRegistry.set('arr:read', () => ['plain', buf]);
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: 33, method: 'arr:read' }));
      await new Promise<void>((r) => setTimeout(r, 0));
      const response = parseSent(sent) as { result: unknown[] };
      expect(response.result[0]).toBe('plain');
      expect(response.result[1]).toEqual({ __type: 'Buffer', data: buf.toString('base64') });
    });

    it('passes null through without modification', async () => {
      mockHandlerRegistry.set('null:method', () => null);
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: 34, method: 'null:method' }));
      await new Promise<void>((r) => setTimeout(r, 0));
      const response = parseSent(sent) as { result: unknown };
      expect(response.result).toBeNull();
    });

    it('passes undefined through without modification', async () => {
      mockHandlerRegistry.set('undef:method', () => undefined);
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: 35, method: 'undef:method' }));
      await new Promise<void>((r) => setTimeout(r, 0));
      // JSON serialisation drops undefined — result key should be absent or null
      const response = parseSent(sent) as Record<string, unknown>;
      expect('error' in response).toBe(false);
    });

    it('passes primitive values through unchanged', async () => {
      mockHandlerRegistry.set('num:method', () => 12345);
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: 36, method: 'num:method' }));
      await new Promise<void>((r) => setTimeout(r, 0));
      const response = parseSent(sent) as { result: unknown };
      expect(response.result).toBe(12345);
    });

    it('encodes deeply nested Buffer', async () => {
      const buf = Buffer.from('deep');
      mockHandlerRegistry.set('deep:read', () => ({ a: { b: { c: buf } } }));
      const { ws, sent } = createMockWs();
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: 37, method: 'deep:read' }));
      await new Promise<void>((r) => setTimeout(r, 0));
      const response = parseSent(sent) as {
        result: { a: { b: { c: { __type: string; data: string } } } };
      };
      expect(response.result.a.b.c).toEqual({ __type: 'Buffer', data: buf.toString('base64') });
    });
  });

  // ── WebSocket state ─────────────────────────────────────────────────────────

  describe('websocket state', () => {
    it('does not send if ws is not OPEN', async () => {
      mockHandlerRegistry.set('test', vi.fn().mockResolvedValue('ok'));
      const sent: string[] = [];
      const ws = {
        readyState: 3, // WebSocket.CLOSED
        send: (data: string) => sent.push(data),
      } as unknown as WebSocket;
      handleJsonRpcMessage(ws, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'test' }));
      await new Promise<void>((r) => setTimeout(r, 0));
      expect(sent).toHaveLength(0);
    });
  });
});
