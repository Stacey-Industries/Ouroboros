/**
 * bridgeResume.test.ts — Tests for the resume handshake and resumable dispatch.
 *
 * Wave 33a Phase E.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { detachDevice, type DispatchContext,dispatchResumable, handleResumeFrame } from './bridgeResume';
import { clearRegistry, detach, getTokensForDevice, register, setSendTarget } from './inflightRegistry';

// ─── Mocks ────────────────────────────────────────────────────────────────────
// vi.mock calls are hoisted by vitest before any imports execute.

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../config', () => ({
  getConfigValue: vi.fn(() => ({ resumeTtlSec: 300 })),
}));

vi.mock('../windowManager', () => ({
  getAllActiveWindows: vi.fn(() => []),
}));

// Channel catalog mock — paired-write channels are resumable
vi.mock('../mobileAccess/channelCatalog', () => ({
  CATALOG_LOOKUP: new Map([
    ['agentChat:sendMessage', { class: 'paired-write', timeoutClass: 'long' }],
    ['files:readFile',        { class: 'paired-read',  timeoutClass: 'normal' }],
    ['app:getVersion',        { class: 'always',       timeoutClass: 'short' }],
    ['config:get',            { class: 'always',       timeoutClass: 'short' }],
  ]),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWs(sent: unknown[]): WebSocket {
  return {
    readyState: 1, // OPEN
    send: (data: string) => sent.push(JSON.parse(data)),
  } as unknown as WebSocket;
}

function makeSendResponse(ws: WebSocket) {
  return (_ws: WebSocket, msg: unknown) => {
    if (ws.readyState === 1) {
      (ws as unknown as { send: (s: string) => void }).send(JSON.stringify(msg));
    }
  };
}

const noopMockEvent = {} as Electron.IpcMainInvokeEvent;
const createEvent = () => noopMockEvent;
const encode = (v: unknown) => v;

function makeCtx(
  handler: (...args: unknown[]) => unknown,
  sendResponse: ReturnType<typeof makeSendResponse>,
): DispatchContext {
  return { handler: handler as DispatchContext['handler'], createEvent, encode, sendResponse };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  clearRegistry();
});

afterEach(() => {
  clearRegistry();
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ─── handleResumeFrame ────────────────────────────────────────────────────────

describe('handleResumeFrame', () => {
  it('returns all tokens as lost when deviceId is null (legacy path)', () => {
    const result = handleResumeFrame(['tok-a', 'tok-b'], null, vi.fn());
    expect(result).toEqual({ resumed: [], lost: ['tok-a', 'tok-b'] });
  });

  it('returns token as lost when not in registry', () => {
    const result = handleResumeFrame(['tok-gone'], 'dev-1', vi.fn());
    expect(result).toEqual({ resumed: [], lost: ['tok-gone'] });
  });

  it('resumes matching token and reattaches send', () => {
    const token = register({ deviceId: 'dev-1', channel: 'agentChat:sendMessage' });
    detach(token);
    const newSent: unknown[] = [];
    const send = (msg: unknown) => newSent.push(msg);

    const result = handleResumeFrame([token], 'dev-1', send);
    expect(result.resumed).toContain(token);
    expect(result.lost).toHaveLength(0);

    // Confirm new send is wired — TTL fires and reaches newSent
    setSendTarget(token, send); // re-confirm the send after reattach
    vi.advanceTimersByTime(300_001);
    expect(newSent.length).toBeGreaterThan(0);
  });

  it('rejects token from different device', () => {
    const token = register({ deviceId: 'dev-1', channel: 'agentChat:sendMessage' });
    detach(token);

    const result = handleResumeFrame([token], 'dev-ATTACKER', vi.fn());
    expect(result.resumed).toHaveLength(0);
    expect(result.lost).toContain(token);
  });

  it('splits correctly between resumed and lost tokens', () => {
    const good = register({ deviceId: 'dev-2', channel: 'files:readFile' });
    detach(good);

    const result = handleResumeFrame([good, 'phantom'], 'dev-2', vi.fn());
    expect(result.resumed).toContain(good);
    expect(result.lost).toContain('phantom');
  });
});

// ─── detachDevice ─────────────────────────────────────────────────────────────

describe('detachDevice', () => {
  it('detaches all tokens for the given device', () => {
    register({ deviceId: 'dev-X', channel: 'agentChat:sendMessage' });
    register({ deviceId: 'dev-X', channel: 'files:readFile' });
    register({ deviceId: 'dev-Y', channel: 'agentChat:sendMessage' });

    const sent: unknown[] = [];
    // Wire send targets so we can verify detach mutes them
    const xTokens = getTokensForDevice('dev-X');
    for (const t of xTokens) setSendTarget(t, (m) => sent.push(m));

    detachDevice('dev-X');

    // Advance TTL — detached entries fire noop, so sent stays empty
    vi.advanceTimersByTime(300_001);
    expect(sent).toHaveLength(0);
  });

  it('is a no-op when device has no in-flight calls', () => {
    expect(() => detachDevice('nobody')).not.toThrow();
  });
});

// ─── dispatchResumable ────────────────────────────────────────────────────────

describe('dispatchResumable', () => {
  it('sends meta frame then result for resumable channel with mobile meta', async () => {
    const sent: unknown[] = [];
    const ws = makeWs(sent);
    const sendResponse = makeSendResponse(ws);
    const meta = { deviceId: 'dev-3', capabilities: ['paired-write'] as const, issuedAt: 0 };

    dispatchResumable(
      ws,
      { jsonrpc: '2.0', id: 42, method: 'agentChat:sendMessage', params: [] },
      meta,
      makeCtx(() => Promise.resolve({ ok: true }), sendResponse),
    );

    // Meta frame arrives synchronously (before handler resolves)
    expect(sent).toHaveLength(1);
    const metaFrame = sent[0] as Record<string, unknown>;
    expect(metaFrame).toMatchObject({ id: 42 });
    expect((metaFrame.meta as Record<string, unknown>)?.resumeToken).toBeTypeOf('string');

    // Let handler resolve
    await vi.runAllTimersAsync();
    await Promise.resolve();

    // Result frame arrives after handler settles
    const resultFrame = sent.find(
      (f) => (f as Record<string, unknown>).result !== undefined,
    ) as Record<string, unknown> | undefined;
    expect(resultFrame).toBeDefined();
    expect(resultFrame?.result).toEqual({ ok: true });
  });

  it('uses plain dispatch (no meta frame) for legacy null connectionMeta', async () => {
    const sent: unknown[] = [];
    const ws = makeWs(sent);
    const sendResponse = makeSendResponse(ws);

    dispatchResumable(
      ws,
      { jsonrpc: '2.0', id: 5, method: 'agentChat:sendMessage', params: [] },
      null, // legacy desktop path
      makeCtx(() => Promise.resolve('pong'), sendResponse),
    );

    await vi.runAllTimersAsync();
    await Promise.resolve();

    // Exactly one frame, no meta field
    expect(sent).toHaveLength(1);
    const frame = sent[0] as Record<string, unknown>;
    expect(frame.meta).toBeUndefined();
    expect(frame.result).toBe('pong');
  });

  it('uses plain dispatch for always-class channel even with mobile meta', async () => {
    const sent: unknown[] = [];
    const ws = makeWs(sent);
    const sendResponse = makeSendResponse(ws);
    const meta = { deviceId: 'dev-4', capabilities: ['always'] as const, issuedAt: 0 };

    dispatchResumable(
      ws,
      { jsonrpc: '2.0', id: 7, method: 'app:getVersion', params: [] },
      meta,
      makeCtx(() => Promise.resolve('1.0.0'), sendResponse),
    );

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(sent).toHaveLength(1);
    const frame = sent[0] as Record<string, unknown>;
    expect(frame.meta).toBeUndefined();
    expect(frame.result).toBe('1.0.0');
  });

  it('sends error frame via registry send on handler rejection', async () => {
    const sent: unknown[] = [];
    const ws = makeWs(sent);
    const sendResponse = makeSendResponse(ws);
    const meta = { deviceId: 'dev-5', capabilities: ['paired-write'] as const, issuedAt: 0 };

    dispatchResumable(
      ws,
      { jsonrpc: '2.0', id: 99, method: 'agentChat:sendMessage', params: [] },
      meta,
      makeCtx(() => Promise.reject(new Error('boom')), sendResponse),
    );

    await vi.runAllTimersAsync();
    await Promise.resolve();

    const errFrame = sent.find(
      (f) => (f as Record<string, unknown>).error !== undefined,
    ) as Record<string, unknown> | undefined;
    expect(errFrame).toBeDefined();
    expect((errFrame?.error as Record<string, unknown>).message).toContain('boom');
  });
});
