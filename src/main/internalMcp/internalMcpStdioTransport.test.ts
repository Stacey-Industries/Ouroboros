/**
 * internalMcpStdioTransport.test.ts — Wave 53j
 *
 * Tests our wrapper logic over the SDK's stdio↔SSE proxy. We do NOT test the
 * SDK transports themselves (their wire format is upstream-tested) — we test
 * the boundaries we own:
 *
 *   1. parsePort: rejects bad input, accepts valid ports.
 *   2. createProxyServer: returns a configured Server with tools/list and
 *      tools/call handlers registered (verified by absence of throws + the
 *      SDK Server instance being returned).
 *
 * The exported helpers (parsePort, createProxyServer) are factored out of
 * main() so they're testable without spawning real subprocesses or SSE
 * connections. main() itself is gated by isScriptEntry() so importing the
 * module under vitest does not auto-spawn the proxy.
 *
 * End-to-end forwarding (Claude Code spawn → bridge → IDE SSE server)
 * is verified by Phase B's manual smoke after IDE restart.
 */

import { describe, expect, it, vi } from 'vitest';

import { createProxyServer, parsePort } from './internalMcpStdioTransport';

// ---------------------------------------------------------------------------
// parsePort
// ---------------------------------------------------------------------------

describe('parsePort', () => {
  it('accepts a valid numeric port string', () => {
    expect(parsePort('54321')).toBe(54321);
  });

  it('accepts the boundary port 65535', () => {
    expect(parsePort('65535')).toBe(65535);
  });

  it('rejects an undefined argument', () => {
    expect(() => parsePort(undefined)).toThrow(/invalid port/);
  });

  it('rejects an empty string', () => {
    expect(() => parsePort('')).toThrow(/invalid port/);
  });

  it('rejects a non-numeric argument', () => {
    expect(() => parsePort('not-a-port')).toThrow(/invalid port/);
  });

  it('rejects a negative port', () => {
    expect(() => parsePort('-1')).toThrow(/invalid port/);
  });

  it('rejects port 0', () => {
    expect(() => parsePort('0')).toThrow(/invalid port/);
  });

  it('rejects ports above 65535', () => {
    expect(() => parsePort('65536')).toThrow(/invalid port/);
  });
});

// ---------------------------------------------------------------------------
// createProxyServer
// ---------------------------------------------------------------------------

describe('createProxyServer', () => {
  it('returns a Server instance when given a Client-shaped mock', () => {
    const mockClient = {
      listTools: vi.fn(async () => ({ tools: [] })),
      callTool: vi.fn(async () => ({ content: [], isError: false })),
    };

    // The SDK's Client type is precise; our mock matches the shape we use.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural mock
    const server = createProxyServer(mockClient as any);
    expect(server).toBeDefined();
    expect(typeof (server as { connect: unknown }).connect).toBe('function');
  });

  it('does not call the client during server construction (lazy delegation)', () => {
    const mockClient = {
      listTools: vi.fn(async () => ({ tools: [] })),
      callTool: vi.fn(async () => ({ content: [], isError: false })),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural mock
    createProxyServer(mockClient as any);
    expect(mockClient.listTools).not.toHaveBeenCalled();
    expect(mockClient.callTool).not.toHaveBeenCalled();
  });
});
