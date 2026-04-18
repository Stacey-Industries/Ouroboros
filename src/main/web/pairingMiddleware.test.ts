/**
 * pairingMiddleware.test.ts — Tests for the POST /api/pair route factory.
 *
 * Wave 33a Phase D.
 */

import type { Request, Response } from 'express';

type ResCtx = { status: number | null; body: unknown };
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetConfigValue = vi.fn();
vi.mock('../config', () => ({
  getConfigValue: mockGetConfigValue,
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { createPairingRouter } = await import('./pairingMiddleware');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: Record<string, unknown> = {}): Request {
  return {
    body,
    method: 'POST',
    url: '/api/pair',
    path: '/api/pair',
    headers: {},
  } as unknown as Request;
}

/**
 * Invoke the router's POST /api/pair handler by dispatching through the
 * router's handle() method. next() not-found means route wasn't matched.
 */
async function callHandler(
  body: Record<string, unknown>,
  mobileEnabled: boolean,
): Promise<ResCtx> {
  mockGetConfigValue.mockReturnValue({ enabled: mobileEnabled, pairedDevices: [] });
  const router = createPairingRouter();
  const req = makeReq(body);
  const ctx: ResCtx = { status: null, body: null };
  const res = {
    status(code: number) { ctx.status = code; return res; },
    json(b: unknown) { ctx.body = b; return res; },
  } as unknown as Response;

  await new Promise<void>((resolve) => {
    (router as unknown as { handle: (req: Request, res: Response, next: () => void) => void }).handle(req, res, () => resolve());
    // If the route matched and responded, ctx will be set synchronously —
    // resolve on next tick so the handler has a chance to call res.json().
    setTimeout(resolve, 10);
  });

  return ctx;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createPairingRouter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a router with stack entries', () => {
    const router = createPairingRouter();
    expect(router.stack.length).toBeGreaterThan(0);
  });
});

describe('POST /api/pair handler', () => {
  beforeEach(() => vi.clearAllMocks());

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

  it('returns 400 when code is not a string', async () => {
    const ctx = await callHandler({ code: 123456 }, true);
    expect(ctx.status).toBe(400);
    expect((ctx.body as { error: string }).error).toMatch(/code/i);
  });

  it('returns 501 stub response when flag is on and code is provided', async () => {
    const ctx = await callHandler({ code: '123456' }, true);
    expect(ctx.status).toBe(501);
    expect((ctx.body as { error: string }).error).toMatch(/Phase H/);
  });
});
