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

import http from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as portRegistry from './internalMcpPortRegistry';
import {
  createProxyServer,
  parsePort,
  probeHealth,
  resolveLivePort,
} from './internalMcpStdioTransport';

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

// ---------------------------------------------------------------------------
// Wave 53l Phase A+ (Fix A): port resolution at bridge spawn time.
// ---------------------------------------------------------------------------

describe('resolveLivePort', () => {
  beforeEach(() => {
    vi.spyOn(portRegistry, 'readPortFileSync').mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers an explicit argv[2] port (back-compat with pre-Fix-A entries)', () => {
    expect(resolveLivePort(['node', 'bridge.js', '54321'])).toBe(54321);
  });

  it('falls back to the port registry file when argv[2] is absent', () => {
    vi.spyOn(portRegistry, 'readPortFileSync').mockReturnValue(58999);
    expect(resolveLivePort(['node', 'bridge.js'])).toBe(58999);
  });

  it('throws a descriptive error when neither argv nor registry has a port', () => {
    expect(() => resolveLivePort(['node', 'bridge.js'])).toThrow(/no live internalMcp port/);
  });

  it('throws on invalid argv port (does not silently fall through to registry)', () => {
    expect(() => resolveLivePort(['node', 'bridge.js', 'not-a-port'])).toThrow(/invalid port/);
  });
});

// ---------------------------------------------------------------------------
// Wave 53l Phase A+ (Fix C): health probe before SSE handshake.
// ---------------------------------------------------------------------------

describe('probeHealth', () => {
  let server: http.Server | null = null;
  let port = 0;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
  });

  it('resolves when /health returns 200', async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"status":"ok"}');
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
    port = (server!.address() as { port: number }).port;
    await expect(probeHealth(port, 1000)).resolves.toBeUndefined();
  });

  it('rejects with a clear error when nothing is listening', async () => {
    // Pick an unused port deterministically: bind, capture port, immediately close.
    const probe = http.createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', () => resolve()));
    const deadPort = (probe.address() as { port: number }).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    await expect(probeHealth(deadPort, 500)).rejects.toThrow();
  });

  it('rejects when /health returns non-200', async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(503);
      res.end();
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
    port = (server!.address() as { port: number }).port;
    await expect(probeHealth(port, 1000)).rejects.toThrow(/status 503/);
  });
});
