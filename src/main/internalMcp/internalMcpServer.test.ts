/**
 * internalMcpServer.test.ts — Wave 53i co-located smoke
 *
 * Tests our routing layer over the SDK-backed MCP server. We deliberately
 * do NOT assert on the exact SSE wire format produced by the SDK — that's
 * the SDK's responsibility and tested upstream. We assert:
 *
 *   1. The server starts on a real port and the handle is shape-correct.
 *   2. GET /sse returns 200 with `text/event-stream` content type and
 *      includes an `event: endpoint` line in its first chunk (proves the
 *      SDK's transport is wired through our `handleSseConnection`).
 *   3. POST /message without sessionId returns 400 (our router-level
 *      guard, not SDK behavior).
 *   4. POST /message with an unknown sessionId returns 404 (our router-
 *      level guard).
 *   5. GET /health returns the expected payload (our route).
 *
 * This is a smoke around the boundaries we own; it is not a substitute
 * for the upstream SDK's transport tests.
 */

import http from 'http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { startInternalMcpServer } from './internalMcpServer';
import type { InternalMcpServerHandle } from './internalMcpTypes';

// Electron's `app` is referenced transitively via the tool registry's
// fallback path (contextLayer module tools). Stub it so vitest can import
// the chain without a real Electron runtime.
vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp',
    isPackaged: false,
    getAppPath: () => process.cwd(),
  },
}));

let handle: InternalMcpServerHandle;

beforeAll(async () => {
  handle = await startInternalMcpServer({
    workspaceRoot: process.cwd(),
    port: 0,
  });
});

afterAll(async () => {
  await handle.stop();
});

interface FetchOptions {
  method?: string;
  path: string;
  acceptStream?: boolean;
}

function httpRequest(
  port: number,
  opts: FetchOptions,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; firstChunk: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (opts.acceptStream) headers.Accept = 'text/event-stream';

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: opts.path,
        method: opts.method ?? 'GET',
        headers,
      },
      (res) => {
        if (opts.acceptStream) {
          res.once('data', (chunk: Buffer) => {
            req.destroy();
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              firstChunk: chunk.toString('utf-8'),
            });
          });
          res.once('error', reject);
        } else {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              firstChunk: Buffer.concat(chunks).toString('utf-8'),
            });
          });
          res.on('error', reject);
        }
      },
    );
    req.once('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

describe('startInternalMcpServer (Wave 53i SDK-backed)', () => {
  it('returns a handle with a real listening port', () => {
    expect(typeof handle.port).toBe('number');
    expect(handle.port).toBeGreaterThan(0);
    expect(typeof handle.stop).toBe('function');
  });

  it('GET /sse returns 200 + text/event-stream + first chunk has endpoint event', async () => {
    const result = await httpRequest(handle.port, { path: '/sse', acceptStream: true });
    expect(result.status).toBe(200);
    expect(String(result.headers['content-type'] ?? '')).toContain('text/event-stream');
    // The SDK writes `event: endpoint\ndata: <postUri>?sessionId=<UUID>\n\n`.
    // We only assert the line-level marker; exact format is the SDK's
    // responsibility and may evolve in non-breaking minors.
    expect(result.firstChunk).toContain('event: endpoint');
  });

  it('POST /message without sessionId returns 400 with descriptive body', async () => {
    const result = await httpRequest(handle.port, { method: 'POST', path: '/message' });
    expect(result.status).toBe(400);
    expect(result.firstChunk).toContain('sessionId');
  });

  it('POST /message with unknown sessionId returns 404', async () => {
    const result = await httpRequest(handle.port, {
      method: 'POST',
      path: '/message?sessionId=does-not-exist',
    });
    expect(result.status).toBe(404);
    expect(result.firstChunk).toContain('Unknown sessionId');
  });

  it('GET /health returns ok status payload', async () => {
    const result = await httpRequest(handle.port, { path: '/health' });
    expect(result.status).toBe(200);
    const parsed = JSON.parse(result.firstChunk);
    expect(parsed.status).toBe('ok');
    expect(parsed.server).toBe('ouroboros');
  });
});
