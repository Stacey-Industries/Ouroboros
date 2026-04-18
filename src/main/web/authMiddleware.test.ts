/**
 * authMiddleware.test.ts — Tests for the HTTP auth middleware.
 *
 * Covers: localhost bypass, mobile-flag-off fallthrough, valid Bearer,
 * invalid Bearer, missing Authorization on non-localhost with flag on.
 *
 * Wave 33a Phase D.
 */

import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetConfigValue = vi.fn();
vi.mock('../config', () => ({
  getConfigValue: (...args: unknown[]) => mockGetConfigValue(...args),
}));

const mockIsRateLimited = vi.fn(() => false);
const mockRecordFailedAttempt = vi.fn();
const mockValidateToken = vi.fn(() => false);
const mockVerifyRefreshToken = vi.fn();
const mockGetLoginPageHtml = vi.fn(() => '<html>login</html>');

vi.mock('./webAuth', () => ({
  isRateLimited: (...args: unknown[]) => mockIsRateLimited(...args),
  recordFailedAttempt: (...args: unknown[]) => mockRecordFailedAttempt(...args),
  validateToken: (...args: unknown[]) => mockValidateToken(...args),
  verifyRefreshToken: (...args: unknown[]) => mockVerifyRefreshToken(...args),
  getLoginPageHtml: () => mockGetLoginPageHtml(),
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { authMiddleware, isLocalhost, parseCookies } = await import('./authMiddleware');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {},
    query: {},
    originalUrl: '/api/test',
    ...overrides,
  } as unknown as Request;
}

interface ResCtx {
  res: Response;
  ctx: { status: number | null; body: unknown; cookies: string[] };
}

function makeRes(): ResCtx {
  const ctx = { status: null as number | null, body: null as unknown, cookies: [] as string[] };
  const res = {
    status(code: number) { ctx.status = code; return res; },
    json(b: unknown) { ctx.body = b; return res; },
    type() { return res; },
    send(b: unknown) { ctx.body = b; return res; },
    setHeader(_k: string, v: unknown) { ctx.cookies.push(String(v)); },
    redirect(code: number) { ctx.status = code; },
  } as unknown as Response;
  return { res, ctx };
}

// ─── isLocalhost ─────────────────────────────────────────────────────────────

describe('isLocalhost', () => {
  it('returns true for 127.0.0.1', () => expect(isLocalhost('127.0.0.1')).toBe(true));
  it('returns true for ::1', () => expect(isLocalhost('::1')).toBe(true));
  it('returns true for ::ffff:127.0.0.1', () => expect(isLocalhost('::ffff:127.0.0.1')).toBe(true));
  it('returns false for a LAN IP', () => expect(isLocalhost('192.168.1.5')).toBe(false));
  it('returns false for a public IP', () => expect(isLocalhost('8.8.8.8')).toBe(false));
});

// ─── parseCookies ─────────────────────────────────────────────────────────────

describe('parseCookies', () => {
  it('parses a single cookie', () => {
    expect(parseCookies('webAccessToken=abc123')).toEqual({ webAccessToken: 'abc123' });
  });

  it('parses multiple cookies', () => {
    expect(parseCookies('a=1; b=2; c=3')).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('handles cookie values containing =', () => {
    const result = parseCookies('token=ab==cd');
    expect(result.token).toBe('ab==cd');
  });

  it('returns empty object for undefined', () => {
    expect(parseCookies(undefined)).toEqual({});
  });
});

// ─── authMiddleware ───────────────────────────────────────────────────────────

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRateLimited.mockReturnValue(false);
    mockGetConfigValue.mockReturnValue({ enabled: false, pairedDevices: [] });
  });

  // ── Rate limiting ────────────────────────────────────────────────────────────

  it('returns 429 when IP is rate-limited', () => {
    mockIsRateLimited.mockReturnValue(true);
    const req = makeReq({ ip: '1.2.3.4' });
    const { res, ctx } = makeRes();
    const next = vi.fn() as NextFunction;
    authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect((ctx.body as { error: string }).error).toMatch(/Too many/);
  });

  // ── Localhost bypass (legacy path, flag off) ─────────────────────────────────

  it('calls next() for localhost with valid token (flag off)', () => {
    mockValidateToken.mockReturnValue(true);
    const req = makeReq({
      ip: '127.0.0.1',
      headers: { cookie: 'webAccessToken=good-token' },
    });
    const { res } = makeRes();
    const next = vi.fn() as NextFunction;
    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 for localhost with invalid token (flag off)', () => {
    mockValidateToken.mockReturnValue(false);
    const req = makeReq({
      ip: '127.0.0.1',
      headers: { cookie: 'webAccessToken=bad', accept: 'application/json' },
    });
    const { res, ctx } = makeRes();
    const next = vi.fn() as NextFunction;
    authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect((ctx.body as { error: string }).error).toMatch(/Unauthorized/);
  });

  // ── Flag-off fallthrough for non-localhost ───────────────────────────────────

  it('uses legacy token path for non-localhost when flag is off', () => {
    mockGetConfigValue.mockReturnValue({ enabled: false, pairedDevices: [] });
    mockValidateToken.mockReturnValue(true);
    const req = makeReq({
      ip: '10.0.0.5',
      headers: { cookie: 'webAccessToken=legacy-token' },
    });
    const { res } = makeRes();
    const next = vi.fn() as NextFunction;
    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(mockVerifyRefreshToken).not.toHaveBeenCalled();
  });

  // ── Mobile path: flag on, non-localhost ──────────────────────────────────────

  it('accepts valid Bearer refresh token for non-localhost with flag on', () => {
    mockGetConfigValue.mockReturnValue({ enabled: true, pairedDevices: [] });
    const fakeDevice = { id: 'dev-1', label: 'Phone', capabilities: ['paired-read'] };
    mockVerifyRefreshToken.mockReturnValue({ device: fakeDevice });
    const req = makeReq({
      ip: '10.0.0.2',
      headers: { authorization: 'Bearer valid-refresh-token' },
    });
    const { res } = makeRes();
    const next = vi.fn() as NextFunction;
    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect((req as unknown as { mobileAccessDevice: unknown }).mobileAccessDevice).toBe(fakeDevice);
  });

  it('returns 401 for invalid Bearer token with flag on (non-localhost)', () => {
    mockGetConfigValue.mockReturnValue({ enabled: true, pairedDevices: [] });
    mockVerifyRefreshToken.mockReturnValue({ device: null, reason: 'token-not-found' });
    const req = makeReq({
      ip: '10.0.0.3',
      headers: { authorization: 'Bearer bad-token' },
    });
    const { res, ctx } = makeRes();
    const next = vi.fn() as NextFunction;
    authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(mockRecordFailedAttempt).toHaveBeenCalledWith('10.0.0.3');
    expect((ctx.body as { error: string }).error).toMatch(/Unauthorized/);
  });

  it('returns 401 when Authorization header is missing on non-localhost with flag on', () => {
    mockGetConfigValue.mockReturnValue({ enabled: true, pairedDevices: [] });
    const req = makeReq({
      ip: '10.0.0.4',
      headers: { accept: 'application/json' },
    });
    const { res, ctx } = makeRes();
    const next = vi.fn() as NextFunction;
    authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect((ctx.body as { error: string }).error).toMatch(/Unauthorized/);
  });

  it('falls through to legacy path for localhost even when mobile flag is on', () => {
    mockGetConfigValue.mockReturnValue({ enabled: true, pairedDevices: [] });
    mockValidateToken.mockReturnValue(true);
    const req = makeReq({
      ip: '127.0.0.1',
      headers: { cookie: 'webAccessToken=desktop-token' },
    });
    const { res } = makeRes();
    const next = vi.fn() as NextFunction;
    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(mockVerifyRefreshToken).not.toHaveBeenCalled();
  });
});
