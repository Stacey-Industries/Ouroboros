/**
 * ideToolServerConnection.test.ts — Smoke tests for the per-connection handler
 * logic extracted into ideToolServerConnection.ts.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('./approvalManager', () => ({ waitForResolution: vi.fn() }));
vi.mock('./lsp', () => ({ getDiagnostics: vi.fn(() => []) }));
vi.mock('./pty', () => ({ getActiveSessions: vi.fn(() => []) }));
vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('./pipeAuth', () => ({
  getToolServerToken: vi.fn(() => 'test-token'),
  validatePipeAuth: vi.fn((_line: string, token: string) => {
    try { return JSON.parse(_line).auth === token; } catch { return false; }
  }),
}));

import { ConnContext, handleSocketData, makeConnContext, makeHandleRequest } from './ideToolServerConnection';

function makeQueryRenderer() {
  return vi.fn().mockResolvedValue({});
}

function makeMockSocket() {
  return {
    destroyed: false,
    write: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(),
  };
}

describe('makeHandleRequest', () => {
  it('returns unknown-method error for unregistered methods', async () => {
    const handlers = { 'ide.ping': async () => ({ status: 'ok' }) };
    const handle = makeHandleRequest(handlers);
    const resp = await handle({ id: 'r1', method: 'ide.notExist', params: {} });
    expect(resp.error?.code).toBe(-32601);
  });

  it('calls the handler and wraps result', async () => {
    const handlers = { 'ide.ping': async () => ({ status: 'ok' }) };
    const handle = makeHandleRequest(handlers);
    const resp = await handle({ id: 'r2', method: 'ide.ping', params: {} });
    expect(resp.result).toEqual({ status: 'ok' });
    expect(resp.error).toBeUndefined();
  });

  it('wraps handler errors as error responses', async () => {
    const handlers = {
      'ide.boom': async () => { throw new Error('exploded'); },
    };
    const handle = makeHandleRequest(handlers);
    const resp = await handle({ id: 'r3', method: 'ide.boom', params: {} });
    expect(resp.error?.code).toBe(-1);
    expect(resp.error?.message).toContain('exploded');
  });
});

describe('makeConnContext', () => {
  it('initialises with empty rawBuffer and unauthenticated state', () => {
    const ctx = makeConnContext(makeQueryRenderer());
    expect(ctx.rawBuffer).toBe('');
    expect(ctx.authenticated).toBe(false);
    expect(ctx.cancelFns).toHaveLength(0);
  });

  it('includes a handleRequest function', () => {
    const ctx = makeConnContext(makeQueryRenderer());
    expect(typeof ctx.handleRequest).toBe('function');
  });
});

describe('handleSocketData', () => {
  it('rejects connection when auth token does not match', () => {
    const socket = makeMockSocket() as unknown as import('net').Socket;
    const ctx: ConnContext = {
      rawBuffer: '',
      authenticated: false,
      cancelFns: [],
      handleRequest: vi.fn(),
    };
    handleSocketData(socket, 1, ctx, '{"auth":"wrong-token"}\n');
    expect(socket.end).toHaveBeenCalledWith('{"error":"unauthorized"}\n');
    expect(ctx.authenticated).toBe(false);
  });

  it('authenticates connection when token matches', () => {
    const socket = makeMockSocket() as unknown as import('net').Socket;
    const ctx: ConnContext = {
      rawBuffer: '',
      authenticated: false,
      cancelFns: [],
      handleRequest: vi.fn().mockResolvedValue({ id: 'x', result: {} }),
    };
    // First chunk: auth line + request line
    handleSocketData(socket, 1, ctx, '{"auth":"test-token"}\n');
    expect(ctx.authenticated).toBe(true);
    expect(socket.end).not.toHaveBeenCalled();
  });

  it('accumulates buffer until newline when partial auth line arrives', () => {
    const socket = makeMockSocket() as unknown as import('net').Socket;
    const ctx: ConnContext = {
      rawBuffer: '',
      authenticated: false,
      cancelFns: [],
      handleRequest: vi.fn(),
    };
    // Send auth in two chunks — no newline in first chunk
    handleSocketData(socket, 1, ctx, '{"auth":"test-t');
    expect(ctx.authenticated).toBe(false);
    expect(socket.end).not.toHaveBeenCalled();
    // Second chunk completes the line
    handleSocketData(socket, 1, ctx, 'oken"}\n');
    expect(ctx.authenticated).toBe(true);
  });
});
