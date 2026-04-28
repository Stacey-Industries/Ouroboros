/**
 * internalMcpServerSse.contract.test.ts — Wave 53f Phase A
 *
 * Contract test for the MCP HTTP+SSE transport handshake. Asserts the SSE
 * stream's first message conforms to the 2024-11-05 spec:
 *
 *   1. The handler must send `event: endpoint\ndata: /message\n\n` first so
 *      the client knows where to POST JSON-RPC requests.
 *   2. The handler must NOT send `notifications/initialized` — that is a
 *      client → server notification per the spec; the server emitting it the
 *      wrong way caused strict clients (Claude Code) to drop the connection.
 *
 * If a future change reverses either of these, this test fails loudly and
 * points at the regression class. See roadmap/wave-53f-plan.md.
 */

import http from 'http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { startInternalMcpServer } from './internalMcpServer';
import type { InternalMcpServerHandle } from './internalMcpTypes';

// Electron's `app` is referenced transitively (threadStore → chatOrchestrationBridge
// → internalMcpServer's tool registration). Stub it for the test runtime since
// vitest doesn't provide a real Electron app. `vi.mock` is hoisted to the top
// of the module by vitest before any imports execute, so its placement after
// the imports here does not affect the mock taking effect.
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

/**
 * Open a GET /sse connection, read the first chunk, close immediately.
 * Returns the chunk as a UTF-8 string.
 */
function readFirstSseChunk(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        hostname: '127.0.0.1',
        port,
        path: '/sse',
        headers: { Accept: 'text/event-stream' },
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`unexpected status ${res.statusCode}`));
          return;
        }
        res.once('data', (chunk: Buffer) => {
          req.destroy();
          resolve(chunk.toString('utf-8'));
        });
        res.once('error', reject);
      },
    );
    req.once('error', reject);
    req.setTimeout(2000, () => {
      req.destroy(new Error('SSE first-chunk timeout'));
    });
  });
}

describe('MCP SSE handshake (Wave 53f contract)', () => {
  it('sends the endpoint event as the first SSE message', async () => {
    const chunk = await readFirstSseChunk(handle.port);
    expect(chunk).toContain('event: endpoint\ndata: /message\n\n');
  });

  it('does not send notifications/initialized on the SSE stream', async () => {
    const chunk = await readFirstSseChunk(handle.port);
    // The wrong-direction notification was the load-bearing pre-53f bug.
    // notifications/initialized is a client → server notification per the
    // MCP spec; the server emitting it would cause strict clients to drop
    // the connection.
    expect(chunk).not.toContain('notifications/initialized');
  });

  it('sets text/event-stream content type', async () => {
    // Independent verification that the response is shaped as SSE at all.
    const port = handle.port;
    const status = await new Promise<{ code: number; ct: string }>((resolve, reject) => {
      const req = http.get(
        { hostname: '127.0.0.1', port, path: '/sse' },
        (res) => {
          const ct = res.headers['content-type'] ?? '';
          req.destroy();
          resolve({ code: res.statusCode ?? 0, ct: String(ct) });
        },
      );
      req.once('error', reject);
      req.setTimeout(2000, () => req.destroy(new Error('header timeout')));
    });
    expect(status.code).toBe(200);
    expect(status.ct).toContain('text/event-stream');
  });
});
