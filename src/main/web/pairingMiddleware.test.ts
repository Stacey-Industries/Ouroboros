/**
 * pairingMiddleware.test.ts — Tests for the POST /api/pair route.
 *
 * Wave 33a Phase H — replaces Phase D stub tests with full coverage.
 */

import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetConfigValue = vi.fn();
vi.mock('../config', () => ({
  getConfigValue: mockGetConfigValue,
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockConsumePairingTicket = vi.fn();
vi.mock('../mobileAccess/pairingHandlers', () => ({
  consumePairingTicket: mockConsumePairingTicket,
}));

const mockIsRateLimited = vi.fn();
const mockRecordFailedAttempt = vi.fn();
vi.mock('./webAuth', () => ({
  isRateLimited: mockIsRateLimited,
  recordFailedAttempt: mockRecordFailedAttempt,
}));

const { createPairingRouter } = await import('./pairingMiddleware');

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ResCtx = { status: number | null; body: unknown };

function makeReq(
  body: Record<string, unknown> = {},
  ip = '10.0.0.1',
): Request {
  return { body, method: 'POST', url: '/api/pair', ip, socket: { remoteAddress: ip }, headers: {} } as unknown as Request;
}

async function callHandler(
  body: Record<string, unknown>,
  mobileEnabled: boolean,
  ip = '10.0.0.1',
): Promise<ResCtx> {
  mockGetConfigValue.mockReturnValue({ enabled: mobileEnabled, pairedDevices: [] });
  const router = createPairingRouter();
  const req = makeReq(body, ip);
  const ctx: ResCtx = { status: null, body: null };
  const res = {
    status(code: number) { ctx.status = code; return res; },
    json(b: unknown) { ctx.body = b; return res; },
  } as unknown as Response;

  await new Promise<void>((resolve) => {
    (router as unknown as { handle: (req: Request, res: Response, next: () => void) => void })
      .handle(req, res, () => resolve());
    setTimeout(resolve, 10);
  });
  return ctx;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createPairingRouter', () => {
  it('returns a router with stack entries', () => {
    const router = createPairingRouter();
    expect(router.stack.length).toBeGreaterThan(0);
  });
});

describe('POST /api/pair — guard checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRateLimited.mockReturnValue(false);
  });

  it('returns 404 when mobileAccess is disabled', async () => {
    const ctx = await callHandler({ code: '123456' }, false);
    expect(ctx.status).toBe(404);
    expect((ctx.body as { error: string }).error).toMatch(/not enabled/i);
  });

  it('returns 400 when code is missing', async () => {
    const ctx = await callHandler({}, true);
    expect(ctx.status).toBe(400);
    expect((ctx.body as { error: string }).error).toMatch(/code/i);
  });

  it('returns 400 when code is empty string', async () => {
    const ctx = await callHandler({ code: '   ' }, true);
    expect(ctx.status).toBe(400);
  });

  it('returns 429 when IP is rate-limited before consume', async () => {
    mockIsRateLimited.mockReturnValue(true);
    const ctx = await callHandler({ code: '123456' }, true);
    expect(ctx.status).toBe(429);
    expect(mockConsumePairingTicket).not.toHaveBeenCalled();
  });
});

describe('POST /api/pair — happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRateLimited.mockReturnValue(false);
  });

  it('returns refreshToken, deviceId, capabilities on success', async () => {
    mockConsumePairingTicket.mockReturnValue({
      refreshToken: 'tok-abc',
      device: { id: 'dev-1', capabilities: ['paired-read', 'paired-write'], label: 'Phone' },
    });
    const ctx = await callHandler({ code: '123456', label: 'Phone', fingerprint: 'fp1' }, true);
    expect(ctx.status).toBeNull(); // 200 — no explicit status call
    const body = ctx.body as { refreshToken: string; deviceId: string; capabilities: string[] };
    expect(body.refreshToken).toBe('tok-abc');
    expect(body.deviceId).toBe('dev-1');
    expect(body.capabilities).toContain('paired-read');
  });

  it('passes code, label, fingerprint, ip to consumePairingTicket', async () => {
    mockConsumePairingTicket.mockReturnValue({
      refreshToken: 'tok',
      device: { id: 'dev-2', capabilities: [], label: 'Test' },
    });
    await callHandler({ code: '654321', label: 'Tablet', fingerprint: 'fp-xy' }, true, '192.168.1.5');
    expect(mockConsumePairingTicket).toHaveBeenCalledWith('654321', 'Tablet', 'fp-xy', '192.168.1.5');
  });

  it('uses default label when label omitted', async () => {
    mockConsumePairingTicket.mockReturnValue({
      refreshToken: 'tok',
      device: { id: 'dev-3', capabilities: [], label: 'Mobile device' },
    });
    await callHandler({ code: '111222' }, true);
    expect(mockConsumePairingTicket).toHaveBeenCalledWith(
      '111222', 'Mobile device', '', expect.any(String),
    );
  });
});

describe('POST /api/pair — error cases from consumePairingTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRateLimited.mockReturnValue(false);
  });

  it('returns 401 for invalid code', async () => {
    mockConsumePairingTicket.mockReturnValue({ error: 'invalid' });
    const ctx = await callHandler({ code: '000000' }, true);
    expect(ctx.status).toBe(401);
    expect((ctx.body as { error: string }).error).toMatch(/invalid/i);
    expect(mockRecordFailedAttempt).toHaveBeenCalled();
  });

  it('returns 401 for expired code', async () => {
    mockConsumePairingTicket.mockReturnValue({ error: 'expired' });
    const ctx = await callHandler({ code: '000001' }, true);
    expect(ctx.status).toBe(401);
    expect((ctx.body as { error: string }).error).toMatch(/expired/i);
  });

  it('returns 401 for already-consumed code', async () => {
    mockConsumePairingTicket.mockReturnValue({ error: 'consumed' });
    const ctx = await callHandler({ code: '000002' }, true);
    expect(ctx.status).toBe(401);
    expect((ctx.body as { error: string }).error).toMatch(/already used/i);
  });

  it('returns 429 for rate-limited result from consumePairingTicket', async () => {
    mockConsumePairingTicket.mockReturnValue({ error: 'rate-limited' });
    const ctx = await callHandler({ code: '999999' }, true);
    expect(ctx.status).toBe(429);
  });

  it('records failed attempt on bad code', async () => {
    mockConsumePairingTicket.mockReturnValue({ error: 'invalid' });
    await callHandler({ code: '000000' }, true, '10.0.0.2');
    expect(mockRecordFailedAttempt).toHaveBeenCalledWith('10.0.0.2');
  });
});
