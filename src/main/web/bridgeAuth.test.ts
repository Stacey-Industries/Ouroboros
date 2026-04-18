/**
 * bridgeAuth.test.ts — Tests for WS upgrade + pairing handshake auth.
 *
 * Covers: valid Bearer → meta returned; invalid Bearer → null;
 * pairing handshake happy path; pairing rate-limit rejection.
 *
 * Wave 33a Phase D.
 */

import type { IncomingMessage } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockIsRateLimited = vi.fn(() => false);
const mockRecordFailedAttempt = vi.fn();
const mockVerifyRefreshToken = vi.fn();
const mockVerifyPairingHandshake = vi.fn();

vi.mock('./webAuth', () => ({
  isRateLimited: mockIsRateLimited,
  recordFailedAttempt: mockRecordFailedAttempt,
  verifyRefreshToken: mockVerifyRefreshToken,
  verifyPairingHandshake: mockVerifyPairingHandshake,
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { authenticateUpgrade, authenticatePairingHandshake } = await import('./bridgeAuth');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(headers: Record<string, string> = {}, ip = '10.0.0.1'): IncomingMessage {
  return {
    headers,
    socket: { remoteAddress: ip },
  } as unknown as IncomingMessage;
}

const fakeDevice = {
  id: 'dev-abc',
  label: 'Test Phone',
  capabilities: ['paired-read', 'paired-write'],
  refreshTokenHash: 'hash',
  fingerprint: 'fp',
  issuedAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
};

// ─── authenticateUpgrade ──────────────────────────────────────────────────────

describe('authenticateUpgrade', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when no Authorization header is present', async () => {
    const meta = await authenticateUpgrade(makeReq({}));
    expect(meta).toBeNull();
  });

  it('returns null when Authorization is not Bearer scheme', async () => {
    const meta = await authenticateUpgrade(makeReq({ authorization: 'Basic abc' }));
    expect(meta).toBeNull();
  });

  it('returns null when Authorization is Pairing scheme (handled elsewhere)', async () => {
    const meta = await authenticateUpgrade(makeReq({ authorization: 'Pairing 123456' }));
    expect(meta).toBeNull();
  });

  it('returns ConnectionMeta for a valid Bearer refresh token', async () => {
    mockVerifyRefreshToken.mockReturnValue({ device: fakeDevice });
    const meta = await authenticateUpgrade(
      makeReq({ authorization: 'Bearer valid-refresh-token' }),
    );
    expect(meta).not.toBeNull();
    expect(meta?.deviceId).toBe('dev-abc');
    expect(meta?.capabilities).toContain('paired-read');
    expect(typeof meta?.issuedAt).toBe('number');
  });

  it('returns null for an invalid Bearer token', async () => {
    mockVerifyRefreshToken.mockReturnValue({ device: null, reason: 'token-not-found' });
    const meta = await authenticateUpgrade(
      makeReq({ authorization: 'Bearer bad-token' }),
    );
    expect(meta).toBeNull();
  });

  it('returns null for localhost with no Authorization (legacy path)', async () => {
    const meta = await authenticateUpgrade(makeReq({}, '127.0.0.1'));
    expect(meta).toBeNull();
  });
});

// ─── authenticatePairingHandshake ─────────────────────────────────────────────

describe('authenticatePairingHandshake', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ok:false with rate-limited reason when IP is rate-limited', async () => {
    mockIsRateLimited.mockReturnValue(true);
    const result = await authenticatePairingHandshake(
      { code: '123456', label: 'Phone', fingerprint: 'fp1' },
      makeReq({}, '10.0.0.2'),
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/rate-limit/i);
  });

  it('returns ok:false on invalid ticket', async () => {
    mockIsRateLimited.mockReturnValue(false);
    mockVerifyPairingHandshake.mockReturnValue({ error: 'invalid' });
    const result = await authenticatePairingHandshake(
      { code: 'bad-code', label: 'Phone', fingerprint: 'fp1' },
      makeReq({}, '10.0.0.3'),
    );
    expect(result.ok).toBe(false);
    expect(mockRecordFailedAttempt).toHaveBeenCalledWith('10.0.0.3');
  });

  it('returns ok:true with meta and result on success', async () => {
    mockIsRateLimited.mockReturnValue(false);
    mockVerifyPairingHandshake.mockReturnValue({
      device: fakeDevice,
      refreshToken: 'new-refresh-token',
    });
    const result = await authenticatePairingHandshake(
      { code: '654321', label: 'My Phone', fingerprint: 'fp2' },
      makeReq({}, '10.0.0.4'),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.meta.deviceId).toBe('dev-abc');
      expect(result.result.refreshToken).toBe('new-refresh-token');
    }
  });

  it('returns ok:false when verifyPairingHandshake returns error:expired', async () => {
    mockIsRateLimited.mockReturnValue(false);
    mockVerifyPairingHandshake.mockReturnValue({ error: 'expired' });
    const result = await authenticatePairingHandshake(
      { code: '111111', label: 'Tablet', fingerprint: 'fp3' },
      makeReq({}, '10.0.0.5'),
    );
    expect(result.ok).toBe(false);
  });
});
