/**
 * bridgeResume.integration.test.ts — Real-socket integration for resume handshake.
 *
 * Wave 41 Phase J. Uses real ws.WebSocketServer on an ephemeral port.
 * Covers: resumable call survives client disconnect + reconnect.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';

// ── Mocks (hoisted before imports) ────────────────────────────────────────────

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../config', () => ({
  getConfigValue: vi.fn(() => ({ resumeTtlSec: 300 })),
}));

vi.mock('../windowManager', () => ({
  getAllActiveWindows: vi.fn(() => []),
}));

// Channel catalog — agentChat:sendMessage is paired-write (resumable)
vi.mock('../mobileAccess/channelCatalog', () => ({
  CATALOG_LOOKUP: new Map([
    ['agentChat:sendMessage', { class: 'paired-write', timeoutClass: 'long' }],
  ]),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import type { DispatchContext } from './bridgeResume';
import { detachDevice, dispatchResumable, handleResumeFrame } from './bridgeResume';
import { clearRegistry } from './inflightRegistry';

// ── Helpers ───────────────────────────────────────────────────────────────────

function sendResponseFn(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

const noopEvent = {} as Electron.IpcMainInvokeEvent;

function makeCtx(
  handlerFn: (...args: unknown[]) => unknown,
): DispatchContext {
  return {
    handler: handlerFn as DispatchContext['handler'],
    createEvent: () => noopEvent,
    encode: (v) => v,
    sendResponse: sendResponseFn,
  };
}

// Collect messages received by a WS client
function collectMessages(ws: WebSocket): unknown[] {
  const msgs: unknown[] = [];
  ws.on('message', (data) => {
    msgs.push(JSON.parse(data.toString()));
  });
  return msgs;
}

function waitForMessage(
  msgs: unknown[],
  predicate: (m: unknown) => boolean,
  timeoutMs = 2000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function check(): void {
      const found = msgs.find(predicate);
      if (found !== undefined) { resolve(found); return; }
      if (Date.now() > deadline) { reject(new Error('waitForMessage timed out')); return; }
      setTimeout(check, 20);
    }

    check();
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let server: WebSocketServer;
let port: number;

beforeEach(async () => {
  clearRegistry();
  // Bind on :0 — OS assigns ephemeral port
  server = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const addr = server.address() as { port: number };
  port = addr.port;
});

afterEach(async () => {
  clearRegistry();
  vi.clearAllMocks();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('bridgeResume — real-socket integration', () => {
  it('delivers result to reconnected client via resume handshake', async () => {
    // ── Server side: one connected socket at a time
    let currentWs: WebSocket | null = null;
    let resumeToken: string | null = null;
    const deviceId = 'device-integration-1';

    // Slow handler that resolves after reconnect
    let resolveHandler!: (value: unknown) => void;
    const handlerPromise = new Promise<unknown>((res) => { resolveHandler = res; });

    server.on('connection', (ws) => {
      currentWs = ws;

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;

        if (msg['method'] === 'resume' && typeof msg['params'] === 'object') {
          // Client is reconnecting with tokens
          const params = msg['params'] as { tokens: string[] };
          const send = (m: unknown): void => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
          };
          const { resumed, lost } = handleResumeFrame(params.tokens, deviceId, send);
          ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg['id'], result: { resumed, lost } }));
          return;
        }

        if (msg['method'] === 'agentChat:sendMessage') {
          const meta = { deviceId, capabilities: ['paired-write'] as const, issuedAt: 0 };
          dispatchResumable(
            ws,
            { jsonrpc: '2.0', id: msg['id'] as number, method: 'agentChat:sendMessage', params: [] },
            meta,
            makeCtx(() => handlerPromise),
          );
        }
      });

      ws.on('close', () => {
        if (resumeToken) detachDevice(deviceId);
      });
    });

    // ── Client 1: connects, sends request, receives meta frame, disconnects ──
    const client1 = new WebSocket(`ws://localhost:${port}`);
    const msgs1 = collectMessages(client1);

    await new Promise<void>((resolve, reject) => {
      client1.on('open', resolve);
      client1.on('error', reject);
    });

    client1.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'agentChat:sendMessage',
      params: [],
    }));

    // Wait for meta frame
    const metaFrame = await waitForMessage(
      msgs1,
      (m) => typeof (m as Record<string, unknown>).meta === 'object',
    ) as Record<string, unknown>;

    resumeToken = (metaFrame.meta as Record<string, string>).resumeToken;
    expect(resumeToken).toBeTruthy();

    // Disconnect client 1
    client1.close();
    await new Promise<void>((resolve) => client1.on('close', resolve));

    // ── Client 2: reconnects, sends resume frame, then handler resolves ──────
    const client2 = new WebSocket(`ws://localhost:${port}`);
    const msgs2 = collectMessages(client2);

    await new Promise<void>((resolve, reject) => {
      client2.on('open', resolve);
      client2.on('error', reject);
    });

    // Reattach the resume token to client2's send function
    client2.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'resume',
      params: { tokens: [resumeToken] },
    }));

    // Wait for ack showing token was resumed
    const ackFrame = await waitForMessage(
      msgs2,
      (m) => {
        const r = (m as Record<string, unknown>).result as Record<string, unknown> | undefined;
        return Array.isArray(r?.resumed);
      },
    ) as Record<string, unknown>;

    const result = ackFrame.result as { resumed: string[] };
    expect(result.resumed).toContain(resumeToken);

    // Now let the handler resolve — result should arrive on client2
    resolveHandler({ answer: 42 });

    const resultFrame = await waitForMessage(
      msgs2,
      (m) => {
        const r = m as Record<string, unknown>;
        return r.result !== undefined && typeof (r.result as Record<string, unknown>).answer === 'number';
      },
    ) as Record<string, unknown>;

    expect((resultFrame.result as Record<string, unknown>).answer).toBe(42);

    void currentWs; // consumed
    client2.close();
  });

  it('dispatches plain (non-resumable) call and resolves immediately', async () => {
    server.on('connection', (ws) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        // Use null meta (legacy desktop path) — no resume, no meta frame
        dispatchResumable(
          ws,
          { jsonrpc: '2.0', id: msg['id'] as number, method: 'agentChat:sendMessage', params: [] },
          null,
          makeCtx(() => Promise.resolve({ direct: true })),
        );
      });
    });

    const client = new WebSocket(`ws://localhost:${port}`);
    const msgs = collectMessages(client);

    await new Promise<void>((resolve, reject) => {
      client.on('open', resolve);
      client.on('error', reject);
    });

    client.send(JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'agentChat:sendMessage', params: [] }));

    const frame = await waitForMessage(
      msgs,
      (m) => {
        const r = (m as Record<string, unknown>).result as Record<string, unknown> | undefined;
        return r?.direct === true;
      },
    ) as Record<string, unknown>;

    expect(frame.meta).toBeUndefined();
    expect((frame.result as Record<string, unknown>).direct).toBe(true);

    client.close();
  });
});
