/**
 * webPreloadTransport.resume.test.ts
 *
 * Wave 33a Phase E — client-side resumable request lifecycle.
 *
 * Simulates the full reconnect scenario using a fake WebSocket class
 * injected via vi.stubGlobal and fake timers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Fake WebSocket ──────────────────────────────────────────────────────────

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  readyState: number = FakeWebSocket.OPEN;
  sent: string[] = [];
  url: string;

  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket._lastInstance = this;
  }

  static _lastInstance: FakeWebSocket | null = null;

  send(data: string): void { this.sent.push(data); }

  triggerOpen(): void { this.onopen?.(new Event('open')); }

  triggerMessage(data: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  }

  triggerClose(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }

  close(): void { this.readyState = FakeWebSocket.CLOSED; }
}

// ─── DOM stubs ────────────────────────────────────────────────────────────────

const overlayStub = {
  id: 'ws-connection-overlay',
  textContent: '',
  style: { cssText: '' },
  remove: vi.fn(),
};

vi.stubGlobal('document', {
  getElementById: vi.fn(() => overlayStub),
  createElement: vi.fn(() => overlayStub),
  body: { prepend: vi.fn() },
});

// window stub — transport uses window.setTimeout in older code path;
// now uses globalThis.setTimeout but we stub window for safety
vi.stubGlobal('window', {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
});

vi.stubGlobal('WebSocket', FakeWebSocket);

// ─── Import SUT after stubs ───────────────────────────────────────────────────

import { WebSocketTransport } from './webPreloadTransport';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLastWs(): FakeWebSocket {
  const ws = FakeWebSocket._lastInstance;
  if (!ws) throw new Error('No FakeWebSocket created yet');
  return ws;
}

function parseSent(ws: FakeWebSocket, index: number): Record<string, unknown> {
  return JSON.parse(ws.sent[index]) as Record<string, unknown>;
}

async function openTransport(): Promise<{ transport: WebSocketTransport; ws: FakeWebSocket }> {
  const transport = new WebSocketTransport('ws://localhost:7890');
  const connectP = transport.connect();
  const ws = getLastWs();
  ws.triggerOpen();
  await connectP;
  return { transport, ws };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket._lastInstance = null;
  overlayStub.remove.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WebSocketTransport — resumable request lifecycle', () => {
  it('resolves a non-resumable request normally (no meta frame)', async () => {
    const { transport, ws } = await openTransport();

    const invokeP = transport.invoke('app:getVersion');
    // First sent frame is the invoke request (no prior resume frame)
    const req = parseSent(ws, 0);
    expect(req.method).toBe('app:getVersion');

    ws.triggerMessage({ jsonrpc: '2.0', id: req.id, result: '1.2.3' });
    await expect(invokeP).resolves.toBe('1.2.3');
  });

  it('does not reject a resumable request on WS close after meta frame', async () => {
    const { transport, ws } = await openTransport();

    const invokeP = transport.invoke('agentChat:sendMessage', 'hello');
    const req = parseSent(ws, 0);

    // Server sends meta frame — promotes to resumable
    ws.triggerMessage({ jsonrpc: '2.0', id: req.id, meta: { resumeToken: 'tok-abc' } });

    // Disconnect — must NOT reject
    ws.triggerClose();
    await vi.advanceTimersByTimeAsync(50);

    let settled = false;
    void invokeP.then(() => { settled = true; }).catch(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it('sends resume frame as first message on reconnect', async () => {
    const { transport, ws: ws1 } = await openTransport();

    void transport.invoke('agentChat:sendMessage', 'hello');
    const req = parseSent(ws1, 0);
    ws1.triggerMessage({ jsonrpc: '2.0', id: req.id, meta: { resumeToken: 'tok-xyz' } });
    ws1.triggerClose();

    // Reconnect
    const connectP2 = transport.connect();
    getLastWs().triggerOpen();
    await connectP2;

    const ws2 = getLastWs();
    expect(ws2.sent.length).toBeGreaterThan(0);
    const resumeFrame = parseSent(ws2, 0);
    expect(resumeFrame.method).toBe('resume');
    const params = resumeFrame.params as Record<string, unknown>;
    expect(Array.isArray(params.tokens)).toBe(true);
    expect(params.tokens as string[]).toContain('tok-xyz');
  });

  it('resolves after reconnect when server acks resume then sends result', async () => {
    const { transport, ws: ws1 } = await openTransport();

    const invokeP = transport.invoke('agentChat:sendMessage', 'hello');
    const req = parseSent(ws1, 0);
    const invokeId = req.id as number;

    ws1.triggerMessage({ jsonrpc: '2.0', id: invokeId, meta: { resumeToken: 'tok-r1' } });
    ws1.triggerClose();

    const connectP2 = transport.connect();
    getLastWs().triggerOpen();
    await connectP2;
    const ws2 = getLastWs();

    // Ack the resume handshake
    const resumeFrame = parseSent(ws2, 0);
    ws2.triggerMessage({
      jsonrpc: '2.0',
      id: resumeFrame.id,
      result: { resumed: ['tok-r1'], lost: [] },
    });

    // Server delivers the actual result
    ws2.triggerMessage({ jsonrpc: '2.0', id: invokeId, result: { ok: true } });

    await expect(invokeP).resolves.toEqual({ ok: true });
  });

  it('rejects with ECONNLOST when server marks token as lost', async () => {
    const { transport, ws: ws1 } = await openTransport();

    const invokeP = transport.invoke('agentChat:sendMessage', 'hello');
    const req = parseSent(ws1, 0);
    const invokeId = req.id as number;

    ws1.triggerMessage({ jsonrpc: '2.0', id: invokeId, meta: { resumeToken: 'tok-lost' } });
    ws1.triggerClose();

    const connectP2 = transport.connect();
    getLastWs().triggerOpen();
    await connectP2;
    const ws2 = getLastWs();

    const resumeFrame = parseSent(ws2, 0);
    ws2.triggerMessage({
      jsonrpc: '2.0',
      id: resumeFrame.id,
      result: { resumed: [], lost: ['tok-lost'] },
    });

    await expect(invokeP).rejects.toThrow('ECONNLOST');
  });

  it('rejects resumable request with ECONNLOST after 5-minute client TTL', async () => {
    const { transport, ws } = await openTransport();

    const invokeP = transport.invoke('agentChat:sendMessage', 'hello');
    const req = parseSent(ws, 0);
    ws.triggerMessage({ jsonrpc: '2.0', id: req.id, meta: { resumeToken: 'tok-ttl' } });

    ws.triggerClose();

    // Attach rejection handler BEFORE advancing timers to avoid unhandled-rejection warning
    const caught = invokeP.catch((e: Error) => e);

    // Advance past the 5-minute offline TTL
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);

    const err = await caught;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('ECONNLOST');
  });

  it('does not send resume frame on reconnect when no resumable requests exist', async () => {
    const { transport, ws: ws1 } = await openTransport();

    // Plain request, no meta frame — stays non-resumable
    void transport.invoke('config:get', 'theme');
    const req = parseSent(ws1, 0);
    ws1.triggerMessage({ jsonrpc: '2.0', id: req.id, result: 'dark' });
    // Let it settle
    await Promise.resolve();

    ws1.triggerClose();

    const connectP2 = transport.connect();
    getLastWs().triggerOpen();
    await connectP2;

    const ws2 = getLastWs();
    if (ws2.sent.length > 0) {
      const first = parseSent(ws2, 0);
      expect(first.method).not.toBe('resume');
    }
    // No frames at all is also acceptable
    expect(true).toBe(true);
  });

  it('rejects non-resumable pending requests immediately on close', async () => {
    const { transport, ws } = await openTransport();

    // Invoke but do not send a meta frame — remains in pendingRequests
    const invokeP = transport.invoke('config:get', 'theme');
    expect(parseSent(ws, 0).method).toBe('config:get');

    ws.triggerClose();

    await expect(invokeP).rejects.toThrow('WebSocket connection closed');
  });
});
